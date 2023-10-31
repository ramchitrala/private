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
public class StudentCatalogue {
    private ArrayList<Student> studentlist;
    
    public StudentCatalogue() {
        this.studentlist = new ArrayList<Student>();
    }
    
    public ArrayList<Student> getstudentlist() {
        return studentlist;
    }

    public void setstudentlist(ArrayList<Student> courseList) {
        this.studentlist = courseList;
    }
    
    public Student addnewStudent(){
        Student student = new Student();
        studentlist.add(student);
        return student;
    }
    
    public void deleteStudent(Student student){
        studentlist.remove(student);
    }
    
}
