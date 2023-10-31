/*
 * Click nbfs://nbhost/SystemFileSystem/Templates/Licenses/license-default.txt to change this license
 * Click nbfs://nbhost/SystemFileSystem/Templates/GUIForms/JFrame.java to edit this template
 */
package Professor_UI;


import model.professor.ProfessorDirectory;
import model.course.CourseDirectory;
import AdminUI.AdminPanel;
import model.professor.ProfessorAccount;
import model.course.Courses;
import Student_UI.Student_UI;
import model.student.Student;
import model.student.StudentCatalogue;
import model.student.choosedcoursecatalogue;
import model.student.studentperformancecatalouge;
import professor.rating.*;



/**
 *
 * @author Donald Mucharla
 */
public class mainJframe extends javax.swing.JFrame {

    /**
     * Creates new form mainJframe
     */
    ProfessorDirectory professordirectory;
    CourseDirectory courseDirectory;
    StudentCatalogue studentCatalogue;
    choosedcoursecatalogue choosedcoursecatalogue;
    studentperformancecatalouge performancecatalogue;
    professorratingCatalogue ratingcatalogue;
    public mainJframe() {
        initComponents();
        professordirectory = new ProfessorDirectory();
        courseDirectory = new CourseDirectory();
        studentCatalogue = new StudentCatalogue();
        choosedcoursecatalogue = new choosedcoursecatalogue();
        performancecatalogue = new studentperformancecatalouge();
        ratingcatalogue = new professorratingCatalogue();
        
        ProfessorAccount p1 = this.professordirectory.addProfessorAccount();
        p1.setFirstNamePro("Eric");
        p1.setLastNamePro("Berner");
        p1.setAgePro("35");
        p1.setCountryPro("USA");
        p1.setLanguagePro("English");
        p1.setBloodGroupPro("A+");
        p1.setUsername("Eprofessor");
        p1.setPassword("professor@123");
        
        ProfessorAccount p2 = this.professordirectory.addProfessorAccount();
        p2.setFirstNamePro("Amruthan");
        p2.setLastNamePro("Arulraj");
        p2.setAgePro("35");
        p2.setCountryPro("India");
        p2.setLanguagePro("Tamil");
        p2.setBloodGroupPro("O+");
        p2.setUsername("Aprofessor");
        p2.setPassword("professor@123");
        
        ProfessorAccount p3 = this.professordirectory.addProfessorAccount();
        p3.setFirstNamePro("Jackson");
        p3.setLastNamePro("Baan");
        p3.setAgePro("45");
        p3.setCountryPro("Netherlands");
        p3.setLanguagePro("Dutch");
        p3.setBloodGroupPro("AB+");
        p3.setUsername("Jprofessor");
        p3.setPassword("professor@123");
        
        ProfessorAccount p4 = this.professordirectory.addProfessorAccount();
        p4.setFirstNamePro("Barak");
        p4.setLastNamePro("Obama");
        p4.setAgePro("50");
        p4.setCountryPro("USA");
        p4.setLanguagePro("English");
        p4.setBloodGroupPro("B-");
        p4.setUsername("Oprofessor");
        p4.setPassword("professor@123");
        
        ProfessorAccount p5 = this.professordirectory.addProfessorAccount();
        p5.setFirstNamePro("Donald");
        p5.setLastNamePro("Trump");
        p5.setAgePro("60");
        p5.setCountryPro("USA");
        p5.setLanguagePro("English");
        p5.setBloodGroupPro("AB-");
        p5.setUsername("Dprofessor");
        p5.setPassword("professor@123");
        
        Courses c1 = courseDirectory.addCourse();
        c1.setCourseTitle("AED");
        c1.setSubjectCode("5100");
        c1.setTerm("Fall 2023");
        c1.setNumofCredit("4");
        c1.setClassTime("Wed 3pm");
        c1.setTeachingLanguage("English");
        c1.setNumofModules("12");
        c1.setProfessorname("Oprofessor");
        c1.setStudentsregistered(0);
        
        Courses c2 = courseDirectory.addCourse();
        c2.setCourseTitle("Web design");
        c2.setSubjectCode("6150");
        c2.setTerm("Fall 2023");
        c2.setNumofCredit("4");
        c2.setClassTime("Tuesday 6pm");
        c2.setTeachingLanguage("English");
        c2.setNumofModules("14");
        c2.setProfessorname("Oprofessor");
        c2.setStudentsregistered(0);
        
        Courses c3 = courseDirectory.addCourse();
        c3.setCourseTitle("AWS");
        c3.setSubjectCode("1000");
        c3.setTerm("Spring 2024");
        c3.setNumofCredit("4");
        c3.setClassTime("Monday 1:00pm");
        c3.setTeachingLanguage("English");
        c3.setNumofModules("14");
        c3.setProfessorname("Dprofessor");
        c3.setStudentsregistered(0);
        
        Courses c4 = courseDirectory.addCourse();
        c4.setCourseTitle("Cloud Computing");
        c4.setSubjectCode("4010");
        c4.setTerm("Spring 2024");
        c4.setNumofCredit("4");
        c4.setClassTime("Thursday 6:30pm");
        c4.setTeachingLanguage("English");
        c4.setNumofModules("14");
        c4.setProfessorname("Dprofessor");
        c4.setStudentsregistered(0);
        
        Courses c5 = courseDirectory.addCourse();
        c5.setCourseTitle("Deveops");
        c5.setSubjectCode("3150");
        c5.setTerm("Fall 2024");
        c5.setNumofCredit("4");
        c5.setClassTime("Saturday 2:00pm");
        c5.setTeachingLanguage("Spanish");
        c5.setNumofModules("14");
        c5.setProfessorname("Eprofessor");
        c5.setStudentsregistered(0);
        
        Courses c6 = courseDirectory.addCourse();
        c6.setCourseTitle("ENCP");
        c6.setSubjectCode("6000");
        c6.setTerm("Fall 2024");
        c6.setNumofCredit("4");
        c6.setClassTime("Saturday 2:00pm");
        c6.setTeachingLanguage("Spanish");
        c6.setNumofModules("14");
        c6.setProfessorname("Eprofessor");
        c6.setStudentsregistered(0);
        
        Courses c7 = courseDirectory.addCourse();
        c7.setCourseTitle("Data Structures");
        c7.setSubjectCode("1100");
        c7.setTerm("Spring 2025");
        c7.setNumofCredit("4");
        c7.setClassTime("Saturday 10:00am");
        c7.setTeachingLanguage("English, Spanish");
        c7.setNumofModules("14");
        c7.setProfessorname("Jprofessor");
        c7.setStudentsregistered(0);
        
        Courses c8 = courseDirectory.addCourse();
        c8.setCourseTitle("Data Science Engineering Methods and Tools");
        c8.setSubjectCode("6105");
        c8.setTerm("Spring 2025");
        c8.setNumofCredit("4");
        c8.setClassTime("Friday 11:00am");
        c8.setTeachingLanguage("English, Spanish");
        c8.setNumofModules("14");
        c8.setProfessorname("Jprofessor");
        c8.setStudentsregistered(0);
        
        Courses c9 = courseDirectory.addCourse();
        c9.setCourseTitle("Engineering of Big-Data Systems");
        c9.setSubjectCode("7250");
        c9.setTerm("Spring 2025");
        c9.setNumofCredit("4");
        c9.setClassTime("Monday 11:00am");
        c9.setTeachingLanguage("English");
        c9.setNumofModules("14");
        c9.setProfessorname("Aprofessor");
        c9.setStudentsregistered(0);
        
        Courses c10 = courseDirectory.addCourse();
        c10.setCourseTitle("Neural Modeling Methods and Tools");
        c10.setSubjectCode("6106");
        c10.setTerm("Spring 2025");
        c10.setNumofCredit("4");
        c10.setClassTime("Friday 11:00am");
        c10.setTeachingLanguage("English");
        c10.setNumofModules("14");
        c10.setProfessorname("Aprofessor");
        c10.setStudentsregistered(0);
        
            Student s1 = studentCatalogue.addnewStudent();
            s1.setFname("Donald");
            s1.setLname("Mucharla");
            s1.setMailid("mucharla.d@northeastern.edu");
            s1.setNuid("131281");
            s1.setTerm("Fall 2023");
            s1.setPhone("1111111");
            s1.setAddress("India");
            s1.setUsername("donald");
            s1.setPassword("donald");
            s1.setDOB("05-04-1997");
            
            Student s2 = studentCatalogue.addnewStudent();
            s2.setFname("Vignesh");
            s2.setLname("Vignesh");
            s2.setMailid("vignesh.s@northeastern.edu");
            s2.setNuid("131282");
            s2.setTerm("Fall 2023");
            s2.setPhone("222222222");
            s2.setAddress("India");
            s2.setUsername("vignesh");
            s2.setPassword("vignesh");
            s1.setDOB("31-12-2000");
            
            Student s3 = studentCatalogue.addnewStudent();
            s3.setFname("Ram");
            s3.setLname("Ram");
            s3.setMailid("ram@northeastern.edu");
            s3.setNuid("131283");
            s3.setTerm("Fall 2023");
            s3.setPhone("333333333");
            s3.setAddress("India");
            s3.setUsername("ram");
            s3.setPassword("ram");
            s1.setDOB("27-02-1999");
            
            
    }
    

    
 
    

    /**
     * This method is called from within the constructor to initialize the form.
     * WARNING: Do NOT modify this code. The content of this method is always
     * regenerated by the Form Editor.
     */
    @SuppressWarnings("unchecked")
    // <editor-fold defaultstate="collapsed" desc="Generated Code">//GEN-BEGIN:initComponents
    private void initComponents() {

        jSplitPane2 = new javax.swing.JSplitPane();
        jPanel3 = new javax.swing.JPanel();
        jButton1 = new javax.swing.JButton();
        jButton2 = new javax.swing.JButton();
        jButton3 = new javax.swing.JButton();
        jPanel4 = new javax.swing.JPanel();
        jLabel1 = new javax.swing.JLabel();
        jLabel2 = new javax.swing.JLabel();

        setDefaultCloseOperation(javax.swing.WindowConstants.EXIT_ON_CLOSE);

        jSplitPane2.setDividerLocation(150);

        jPanel3.setBackground(new java.awt.Color(255, 255, 255));

        jButton1.setText("Professor");
        jButton1.addActionListener(new java.awt.event.ActionListener() {
            public void actionPerformed(java.awt.event.ActionEvent evt) {
                jButton1ActionPerformed(evt);
            }
        });

        jButton2.setText("Student");
        jButton2.addActionListener(new java.awt.event.ActionListener() {
            public void actionPerformed(java.awt.event.ActionEvent evt) {
                jButton2ActionPerformed(evt);
            }
        });

        jButton3.setText("Admin");
        jButton3.addActionListener(new java.awt.event.ActionListener() {
            public void actionPerformed(java.awt.event.ActionEvent evt) {
                jButton3ActionPerformed(evt);
            }
        });

        javax.swing.GroupLayout jPanel3Layout = new javax.swing.GroupLayout(jPanel3);
        jPanel3.setLayout(jPanel3Layout);
        jPanel3Layout.setHorizontalGroup(
            jPanel3Layout.createParallelGroup(javax.swing.GroupLayout.Alignment.LEADING)
            .addGroup(jPanel3Layout.createSequentialGroup()
                .addGap(31, 31, 31)
                .addGroup(jPanel3Layout.createParallelGroup(javax.swing.GroupLayout.Alignment.LEADING)
                    .addComponent(jButton3)
                    .addComponent(jButton2)
                    .addComponent(jButton1))
                .addGap(39, 39, 39))
        );

        jPanel3Layout.linkSize(javax.swing.SwingConstants.HORIZONTAL, new java.awt.Component[] {jButton1, jButton2, jButton3});

        jPanel3Layout.setVerticalGroup(
            jPanel3Layout.createParallelGroup(javax.swing.GroupLayout.Alignment.LEADING)
            .addGroup(jPanel3Layout.createSequentialGroup()
                .addGap(94, 94, 94)
                .addComponent(jButton1)
                .addGap(18, 18, 18)
                .addComponent(jButton2)
                .addGap(18, 18, 18)
                .addComponent(jButton3)
                .addGap(301, 301, 301))
        );

        jSplitPane2.setLeftComponent(jPanel3);

        jPanel4.setBackground(new java.awt.Color(255, 255, 255));

        jLabel1.setFont(new java.awt.Font("Tw Cen MT Condensed", 1, 48)); // NOI18N
        jLabel1.setHorizontalAlignment(javax.swing.SwingConstants.CENTER);
        jLabel1.setText("Welcom ");

        jLabel2.setFont(new java.awt.Font("Segoe UI", 1, 24)); // NOI18N
        jLabel2.setHorizontalAlignment(javax.swing.SwingConstants.CENTER);
        jLabel2.setText("to E-learning Platform");

        javax.swing.GroupLayout jPanel4Layout = new javax.swing.GroupLayout(jPanel4);
        jPanel4.setLayout(jPanel4Layout);
        jPanel4Layout.setHorizontalGroup(
            jPanel4Layout.createParallelGroup(javax.swing.GroupLayout.Alignment.LEADING)
            .addGroup(jPanel4Layout.createSequentialGroup()
                .addGap(60, 60, 60)
                .addComponent(jLabel2, javax.swing.GroupLayout.PREFERRED_SIZE, 320, javax.swing.GroupLayout.PREFERRED_SIZE))
            .addGroup(jPanel4Layout.createSequentialGroup()
                .addGap(110, 110, 110)
                .addComponent(jLabel1, javax.swing.GroupLayout.PREFERRED_SIZE, 240, javax.swing.GroupLayout.PREFERRED_SIZE))
        );
        jPanel4Layout.setVerticalGroup(
            jPanel4Layout.createParallelGroup(javax.swing.GroupLayout.Alignment.LEADING)
            .addGroup(jPanel4Layout.createSequentialGroup()
                .addGap(150, 150, 150)
                .addComponent(jLabel2))
            .addComponent(jLabel1, javax.swing.GroupLayout.PREFERRED_SIZE, 220, javax.swing.GroupLayout.PREFERRED_SIZE)
        );

        jSplitPane2.setRightComponent(jPanel4);

        javax.swing.GroupLayout layout = new javax.swing.GroupLayout(getContentPane());
        getContentPane().setLayout(layout);
        layout.setHorizontalGroup(
            layout.createParallelGroup(javax.swing.GroupLayout.Alignment.LEADING)
            .addComponent(jSplitPane2, javax.swing.GroupLayout.DEFAULT_SIZE, 600, Short.MAX_VALUE)
        );
        layout.setVerticalGroup(
            layout.createParallelGroup(javax.swing.GroupLayout.Alignment.LEADING)
            .addComponent(jSplitPane2)
        );

        pack();
    }// </editor-fold>//GEN-END:initComponents

    private void jButton1ActionPerformed(java.awt.event.ActionEvent evt) {//GEN-FIRST:event_jButton1ActionPerformed
        ProfessorFirst professor = new ProfessorFirst(professordirectory, courseDirectory, performancecatalogue, choosedcoursecatalogue, studentCatalogue, performancecatalogue );
        jSplitPane2.setRightComponent(professor);
    }//GEN-LAST:event_jButton1ActionPerformed

    private void jButton3ActionPerformed(java.awt.event.ActionEvent evt) {//GEN-FIRST:event_jButton3ActionPerformed
        AdminPanel admin = new AdminPanel(professordirectory, courseDirectory);
        jSplitPane2.setRightComponent(admin);
    }//GEN-LAST:event_jButton3ActionPerformed

    private void jButton2ActionPerformed(java.awt.event.ActionEvent evt) {//GEN-FIRST:event_jButton2ActionPerformed
        Student_UI studentpanel = new Student_UI(studentCatalogue, courseDirectory, professordirectory, choosedcoursecatalogue, performancecatalogue, ratingcatalogue);
        jSplitPane2.setRightComponent(studentpanel);
    }//GEN-LAST:event_jButton2ActionPerformed

    /**
     * @param args the command line arguments
     */
    public static void main(String args[]) {
        /* Set the Nimbus look and feel */
        //<editor-fold defaultstate="collapsed" desc=" Look and feel setting code (optional) ">
        /* If Nimbus (introduced in Java SE 6) is not available, stay with the default look and feel.
         * For details see http://download.oracle.com/javase/tutorial/uiswing/lookandfeel/plaf.html 
         */
        try {
            for (javax.swing.UIManager.LookAndFeelInfo info : javax.swing.UIManager.getInstalledLookAndFeels()) {
                if ("Nimbus".equals(info.getName())) {
                    javax.swing.UIManager.setLookAndFeel(info.getClassName());
                    break;
                }
            }
        } catch (ClassNotFoundException ex) {
            java.util.logging.Logger.getLogger(mainJframe.class.getName()).log(java.util.logging.Level.SEVERE, null, ex);
        } catch (InstantiationException ex) {
            java.util.logging.Logger.getLogger(mainJframe.class.getName()).log(java.util.logging.Level.SEVERE, null, ex);
        } catch (IllegalAccessException ex) {
            java.util.logging.Logger.getLogger(mainJframe.class.getName()).log(java.util.logging.Level.SEVERE, null, ex);
        } catch (javax.swing.UnsupportedLookAndFeelException ex) {
            java.util.logging.Logger.getLogger(mainJframe.class.getName()).log(java.util.logging.Level.SEVERE, null, ex);
        }
        //</editor-fold>

        /* Create and display the form */
        java.awt.EventQueue.invokeLater(new Runnable() {
            public void run() {
                new mainJframe().setVisible(true);
            }
        });
    }

    // Variables declaration - do not modify//GEN-BEGIN:variables
    private javax.swing.JButton jButton1;
    private javax.swing.JButton jButton2;
    private javax.swing.JButton jButton3;
    private javax.swing.JLabel jLabel1;
    private javax.swing.JLabel jLabel2;
    private javax.swing.JPanel jPanel3;
    private javax.swing.JPanel jPanel4;
    private javax.swing.JSplitPane jSplitPane2;
    // End of variables declaration//GEN-END:variables
}
