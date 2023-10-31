/*
 * Click nbfs://nbhost/SystemFileSystem/Templates/Licenses/license-default.txt to change this license
 * Click nbfs://nbhost/SystemFileSystem/Templates/Classes/Class.java to edit this template
 */
package professor.rating;

/**
 *
 * @author Donald Mucharla
 */
public class professorRating {
    private String studentuname;
    private String studentname;

    public String getStudentname() {
        return studentname;
    }

    public void setStudentname(String studentname) {
        this.studentname = studentname;
    }
    private String professoruname;
    private int rating;
    private String subjectcode;
    private String professorname;

    public String getSubjectcode() {
        return subjectcode;
    }

    public void setSubjectcode(String subjectcode) {
        this.subjectcode = subjectcode;
    }

    public String getProfessorname() {
        return professorname;
    }

    public void setProfessorname(String professorname) {
        this.professorname = professorname;
    }

    public String getStudentuname() {
        return studentuname;
    }

    public void setStudentuname(String studentuname) {
        this.studentuname = studentuname;
    }

    public String getProfessoruname() {
        return professoruname;
    }

    public void setProfessoruname(String professoruname) {
        this.professoruname = professoruname;
    }

    public int getRating() {
        return rating;
    }

    public void setRating(int rating) {
        this.rating = rating;
    }
     @Override
    public String toString(){
        
        return professorname;
        
    }
    
    
}
