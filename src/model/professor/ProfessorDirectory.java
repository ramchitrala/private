/*
 * Click nbfs://nbhost/SystemFileSystem/Templates/Licenses/license-default.txt to change this license
 * Click nbfs://nbhost/SystemFileSystem/Templates/Classes/Class.java to edit this template
 */
package model.professor;

import java.util.ArrayList;

/**
 *
 * @author Donald Mucharla
 */
public class ProfessorDirectory {
    private ArrayList<ProfessorAccount> professorList;
    
    public ProfessorDirectory() {
        this.professorList = new ArrayList<ProfessorAccount>();
    }
    
    public ArrayList<ProfessorAccount> getProfessorList() {
        return professorList;
    }

    public void setProfessorList(ArrayList<ProfessorAccount> professorList) {
        this.professorList = professorList;
    }
    
    public ProfessorAccount addProfessorAccount(){
        ProfessorAccount professoraccount = new ProfessorAccount();
        professorList.add(professoraccount);
        return professoraccount;
    }
    
    public void deleteProfessorAccount(ProfessorAccount account){
        professorList.remove(account);
    }
    
    public ProfessorAccount searchProfessorAccount(String name){
        for(ProfessorAccount account : professorList){
            if(account.getFirstNamePro().equals(name)){
                return account;
            }
        }
        return null;
    }
}
