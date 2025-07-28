from flask import Flask, request, jsonify
from models import db, User, Availability, ClockEntry
from datetime import datetime
import uuid

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///clockapp.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# simple token storage (not for production)
tokens = {}

db.init_app(app)

def create_tables():
    with app.app_context():
        db.create_all()
        if not User.query.filter_by(username='admin').first():
            admin = User(username='admin', password='admin', role='admin')
            db.session.add(admin)
            db.session.commit()

create_tables()

@app.route('/login', methods=['POST'])
def login():
    data = request.json
    user = User.query.filter_by(username=data.get('username'), password=data.get('password')).first()
    if user:
        token = str(uuid.uuid4())
        tokens[token] = user.id
        return jsonify({'token': token})
    return jsonify({'error': 'invalid credentials'}), 401

def require_auth(func):
    def wrapper(*args, **kwargs):
        token = request.headers.get('Authorization')
        if not token or token not in tokens:
            return jsonify({'error': 'unauthorized'}), 401
        request.user_id = tokens[token]
        return func(*args, **kwargs)
    wrapper.__name__ = func.__name__
    return wrapper

@app.route('/availability', methods=['POST'])
@require_auth
def add_availability():
    data = request.json
    entry = Availability(user_id=request.user_id,
                         day=data['day'],
                         start_time=data['start_time'],
                         end_time=data['end_time'])
    db.session.add(entry)
    db.session.commit()
    return jsonify({'status': 'added'})

@app.route('/availability/best', methods=['GET'])
@require_auth
def best_times():
    user = User.query.get(request.user_id)
    if user.role != 'admin':
        return jsonify({'error': 'forbidden'}), 403
    # naive algorithm: find overlap of all availabilities per day
    result = {}
    for day in ['Monday','Tuesday','Wednesday','Thursday','Friday']:
        day_entries = Availability.query.filter_by(day=day).all()
        if not day_entries:
            continue
        start = max(e.start_time for e in day_entries)
        end = min(e.end_time for e in day_entries)
        if start < end:
            result[day] = f"{start}-{end}"
    return jsonify(result)

@app.route('/clock/in', methods=['POST'])
@require_auth
def clock_in():
    entry = ClockEntry(user_id=request.user_id, clock_in=datetime.utcnow())
    db.session.add(entry)
    db.session.commit()
    return jsonify({'status': 'clocked in', 'entry_id': entry.id})

@app.route('/clock/out', methods=['POST'])
@require_auth
def clock_out():
    entry_id = request.json.get('entry_id')
    entry = ClockEntry.query.get(entry_id)
    if not entry or entry.user_id != request.user_id:
        return jsonify({'error': 'invalid entry'}), 400
    entry.clock_out = datetime.utcnow()
    db.session.commit()
    return jsonify({'status': 'clocked out'})

if __name__ == '__main__':
    app.run(debug=True)
