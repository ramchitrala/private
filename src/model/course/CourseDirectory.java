/*
 * Click nbfs://nbhost/SystemFileSystem/Templates/Licenses/license-default.txt to change this license
 * Click nbfs://nbhost/SystemFileSystem/Templates/Classes/Class.java to edit this template
 */
package model.course;

import java.util.ArrayList;

/**
 *
 * @author Donald Mucharla
 */
public class CourseDirectory {
    private ArrayList<Courses> courseList;
    
    public CourseDirectory() {
        this.courseList = new ArrayList<Courses>();
    }
    
    public ArrayList<Courses> getCourseList() {
        return courseList;
    }

    public void setCourseList(ArrayList<Courses> courseList) {
        this.courseList = courseList;
    }
    
    public Courses addCourse(){
        Courses newcourse = new Courses();
        courseList.add(newcourse);
        return newcourse;
    }
    
    public void deleteCourse(Courses courses){
        courseList.remove(courses);
    }
    
    public Courses searchcouCourses(String title){
        for(Courses course : courseList){
            if(course.getCourseTitle().equals(title)){
                return course;
            }
        }
        return null;
    }
}
