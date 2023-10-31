/*
 * Click nbfs://nbhost/SystemFileSystem/Templates/Licenses/license-default.txt to change this license
 * Click nbfs://nbhost/SystemFileSystem/Templates/Classes/Class.java to edit this template
 */
package model.student;

import java.util.ArrayList;

/**
 *
 * @author Donald Mucharla
 */
public class choosedcoursecatalogue {
    
    private ArrayList<choosedcourses> choosedcourse;
    
    public choosedcoursecatalogue(){
        this.choosedcourse = new ArrayList<>();
    }
    
    public ArrayList<choosedcourses> getChoosedcourseslist() {
        return choosedcourse;
    }
    
    public choosedcourses addChoosedcourseList(){
        choosedcourses newcourselsit = new choosedcourses();
        choosedcourse.add(newcourselsit);
        return newcourselsit;
    }
    
    public void deleteCourselsit(choosedcourses courses){
        choosedcourse.remove(courses);
    }
    
}
