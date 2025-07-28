import os, sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
import json
from app import app, db, User

app.testing = True
client = app.test_client()


def setup_module(module):
    with app.app_context():
        db.drop_all()
        db.create_all()
        db.session.add(User(username='admin', password='admin', role='admin'))
        db.session.add(User(username='emp', password='emp', role='employee'))
        db.session.commit()


def get_token(username, password):
    resp = client.post('/login', json={'username': username, 'password': password})
    data = json.loads(resp.data)
    return data.get('token')


def test_login():
    token = get_token('admin', 'admin')
    assert token


def test_availability_and_best():
    emp_token = get_token('emp', 'emp')
    client.post('/availability', json={
        'day': 'Monday', 'start_time': '09:00', 'end_time': '17:00'
    }, headers={'Authorization': emp_token})
    admin_token = get_token('admin', 'admin')
    resp = client.get('/availability/best', headers={'Authorization': admin_token})
    assert resp.status_code == 200
