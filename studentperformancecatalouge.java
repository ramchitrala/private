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
public class studentperformancecatalouge {
    private ArrayList<studentperformance> studentperformance;
    
    public studentperformancecatalouge(){
        this.studentperformance = new ArrayList<>();
    }
    
    public ArrayList<studentperformance> getperformancelistlist() {
        return studentperformance;
    }
    
    public studentperformance addperformanceList(){
        studentperformance newperformancelsit = new studentperformance();
        studentperformance.add(newperformancelsit);
        return newperformancelsit;
    }
    
    public void deleteperformacelsit(studentperformance performance){
        studentperformance.remove(performance);
    }
}
