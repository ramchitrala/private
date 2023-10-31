/*
 * Click nbfs://nbhost/SystemFileSystem/Templates/Licenses/license-default.txt to change this license
 * Click nbfs://nbhost/SystemFileSystem/Templates/Classes/Class.java to edit this template
 */
package model.student;

/**
 *
 * @author Donald Mucharla
 */
public class studentperformance {
    private String uername;
    private String Name;
    private String NUID;
    private String subjectcode;
    private String status;
    private int gpa;
    private String completedweeks;
    private String Grade;
    private int total;
    private String term;
    private String coursetitle;

    public String getCoursetitle() {
        return coursetitle;
    }

    public void setCoursetitle(String coursetitle) {
        this.coursetitle = coursetitle;
    }
    

    public String getTerm() {
        return term;
    }

    public void setTerm(String term) {
        this.term = term;
    }

    public String getNUID() {
        return NUID;
    }

    public void setNUID(String NUID) {
        this.NUID = NUID;
    }

    public String getName() {
        return Name;
    }

    public void setName(String Name) {
        this.Name = Name;
    }
    

    public String getCompletedweeks() {
        return completedweeks;
    }

    public void setCompletedweeks(String completedweeks) {
        this.completedweeks = completedweeks;
    }

    public int getGpa() {
        return gpa;
    }

    public void setGpa(int gpa) {
        this.gpa = gpa;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getUername() {
        return uername;
    }

    public void setUername(String uername) {
        this.uername = uername;
    }

    public String getSubjectcode() {
        return subjectcode;
    }

    public void setSubjectcode(String subjectcode) {
        this.subjectcode = subjectcode;
    }

//    private int sem1;
//    private int sem2;
//    private int sem3;
//    private int sem4;
    

    public int getTotal() {
        return total;
    }

    public void setTotal(int total) {
        this.total = total;
    }

    public String getGrade() {
        return Grade;
    }

    public void setGrade(String Grade) {
        this.Grade = Grade;
    }

//    public int getSem1() {
//        return sem1;
//    }
//
//    public void setSem1(int sem1) {
//        this.sem1 = sem1;
//    }
//
//    public int getSem2() {
//        return sem2;
//    }
//
//    public void setSem2(int sem2) {
//        this.sem2 = sem2;
//    }
//
//    public int getSem3() {
//        return sem3;
//    }
//
//    public void setSem3(int sem3) {
//        this.sem3 = sem3;
//    }
//
//    public int getSem4() {
//        return sem4;
//    }
//
//    public void setSem4(int sem4) {
//        this.sem4 = sem4;
//    }
    @Override
    public String toString(){
        
        return Name;
        
    }
    
//    public String toString() {
//        return "studentperformance{" + "Name=" + Name + ", coursetitle=" + coursetitle + '}';
//    }
    
}
