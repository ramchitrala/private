/*
 * Click nbfs://nbhost/SystemFileSystem/Templates/Licenses/license-default.txt to change this license
 * Click nbfs://nbhost/SystemFileSystem/Templates/Classes/Class.java to edit this template
 */
package model.course;

/**
 *
 * @author Donald Mucharla
 */
public class Courses {
    private String courseTitle;
    private String subjectCode;
    private String Term;
    private String classTime;
    private String numofCredit;
    private String numofModules;
    private String teachingLanguage;
    private String professorname;

    public String getProfessorname() {
        return professorname;
    }

    public void setProfessorname(String professorname) {
        this.professorname = professorname;
    }

    public String getCourseTitle() {
        return courseTitle;
    }

    public void setCourseTitle(String courseTitle) {
        this.courseTitle = courseTitle;
    }

    public String getSubjectCode() {
        return subjectCode;
    }

    public void setSubjectCode(String subjectCode) {
        this.subjectCode = subjectCode;
    }

    public String getTerm() {
        return Term;
    }

    public void setTerm(String Term) {
        this.Term = Term;
    }

    public String getClassTime() {
        return classTime;
    }

    public void setClassTime(String classTime) {
        this.classTime = classTime;
    }

    public String getNumofCredit() {
        return numofCredit;
    }

    public void setNumofCredit(String numofCredit) {
        this.numofCredit = numofCredit;
    }

    public String getNumofModules() {
        return numofModules;
    }

    public void setNumofModules(String numofModules) {
        this.numofModules = numofModules;
    }

    public String getTeachingLanguage() {
        return teachingLanguage;
    }

    public void setTeachingLanguage(String teachingLanguage) {
        this.teachingLanguage = teachingLanguage;
    }
    
    @Override
    public String toString(){
        
        return courseTitle;
        
    }
    
    
}
