/*
 * Click nbfs://nbhost/SystemFileSystem/Templates/Licenses/license-default.txt to change this license
 * Click nbfs://nbhost/SystemFileSystem/Templates/Classes/Class.java to edit this template
 */
package professor.rating;

import java.util.ArrayList;

/**
 *
 * @author Donald Mucharla
 */
public class professorratingCatalogue {
    private ArrayList<professorRating> ratinglist;
    
    public professorratingCatalogue() {
        this.ratinglist = new ArrayList<professorRating>();
    }
    
    public ArrayList<professorRating> getratingList() {
        return ratinglist;
    }
    
    public void setratingList(ArrayList<professorRating> ratinglist) {
        this.ratinglist = ratinglist;
    }
    
    public professorRating addratinglist(){
        professorRating prorating = new professorRating();
        ratinglist.add(prorating);
        return prorating;
    }
    
    public void deleteProfessorrating(professorRating prorating){
        ratinglist.remove(prorating);
    }
    
}
