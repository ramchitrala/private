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
import java.awt.Component;
import model.student.Student;
import model.student.StudentCatalogue;
import model.student.choosedcoursecatalogue;


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
    Student student;
    StudentCatalogue studentCatalogue;
    choosedcoursecatalogue choosedcoursecatalogue;
    public mainJframe() {
        initComponents();
        professordirectory = new ProfessorDirectory();
        courseDirectory = new CourseDirectory();
        student = new Student();
        studentCatalogue = new StudentCatalogue();
        choosedcoursecatalogue = new choosedcoursecatalogue();
        
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
        
        Courses c2 = courseDirectory.addCourse();
        c2.setCourseTitle("Web design");
        c2.setSubjectCode("6150");
        c2.setTerm("Fall 2023");
        c2.setNumofCredit("4");
        c2.setClassTime("Tuesday 6pm");
        c2.setTeachingLanguage("English");
        c2.setNumofModules("14");
        c2.setProfessorname("Oprofessor");
        
        Courses c3 = courseDirectory.addCourse();
        c3.setCourseTitle("AWS");
        c3.setSubjectCode("1000");
        c3.setTerm("Spring 2024");
        c3.setNumofCredit("4");
        c3.setClassTime("Monday 1:00pm");
        c3.setTeachingLanguage("English");
        c3.setNumofModules("14");
        c3.setProfessorname("Dprofessor");
        
        Courses c4 = courseDirectory.addCourse();
        c4.setCourseTitle("Cloud Computing");
        c4.setSubjectCode("4010");
        c4.setTerm("Spring 2024");
        c4.setNumofCredit("4");
        c4.setClassTime("Thursday 6:30pm");
        c4.setTeachingLanguage("English");
        c4.setNumofModules("14");
        c4.setProfessorname("Dprofessor");
        
        Courses c5 = courseDirectory.addCourse();
        c5.setCourseTitle("Deveops");
        c5.setSubjectCode("3150");
        c5.setTerm("Fall 2024");
        c5.setNumofCredit("4");
        c5.setClassTime("Saturday 2:00pm");
        c5.setTeachingLanguage("Spanish");
        c5.setNumofModules("14");
        c5.setProfessorname("Eprofessor");
        
        Courses c6 = courseDirectory.addCourse();
        c6.setCourseTitle("ENCP");
        c6.setSubjectCode("6000");
        c6.setTerm("Fall 2024");
        c6.setNumofCredit("4");
        c6.setClassTime("Saturday 2:00pm");
        c6.setTeachingLanguage("Spanish");
        c6.setNumofModules("14");
        c6.setProfessorname("Eprofessor");
        
        Courses c7 = courseDirectory.addCourse();
        c7.setCourseTitle("Data Structures");
        c7.setSubjectCode("1100");
        c7.setTerm("Spring 2025");
        c7.setNumofCredit("4");
        c7.setClassTime("Saturday 10:00am");
        c7.setTeachingLanguage("English, Spanish");
        c7.setNumofModules("14");
        c7.setProfessorname("Jprofessor");
        
        Courses c8 = courseDirectory.addCourse();
        c8.setCourseTitle("Data Science Engineering Methods and Tools");
        c8.setSubjectCode("6105");
        c8.setTerm("Spring 2025");
        c8.setNumofCredit("4");
        c8.setClassTime("Friday 11:00am");
        c8.setTeachingLanguage("English, Spanish");
        c8.setNumofModules("14");
        c8.setProfessorname("Jprofessor");
        
        Courses c9 = courseDirectory.addCourse();
        c9.setCourseTitle("Engineering of Big-Data Systems");
        c9.setSubjectCode("7250");
        c9.setTerm("Spring 2025");
        c9.setNumofCredit("4");
        c9.setClassTime("Monday 11:00am");
        c9.setTeachingLanguage("English");
        c9.setNumofModules("14");
        c9.setProfessorname("Aprofessor");
        
        Courses c10 = courseDirectory.addCourse();
        c10.setCourseTitle("Neural Modeling Methods and Tools");
        c10.setSubjectCode("6106");
        c10.setTerm("Spring 2025");
        c10.setNumofCredit("4");
        c10.setClassTime("Friday 11:00am");
        c10.setTeachingLanguage("English");
        c10.setNumofModules("14");
        c10.setProfessorname("Aprofessor");
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
        jLabel5 = new javax.swing.JLabel();
        jLabel6 = new javax.swing.JLabel();
        jLabel7 = new javax.swing.JLabel();
        jPanel4 = new javax.swing.JPanel();
        jLabel3 = new javax.swing.JLabel();
        jLabel1 = new javax.swing.JLabel();
        jLabel2 = new javax.swing.JLabel();
        jLabel4 = new javax.swing.JLabel();
        husky = new javax.swing.JLabel();

        setDefaultCloseOperation(javax.swing.WindowConstants.EXIT_ON_CLOSE);

        jSplitPane2.setDividerLocation(150);

        jPanel3.setBackground(new java.awt.Color(255, 255, 255));

        jButton1.setIcon(new javax.swing.ImageIcon(getClass().getResource("/img/professor.png"))); // NOI18N
        jButton1.setCursor(new java.awt.Cursor(java.awt.Cursor.HAND_CURSOR));
        jButton1.setPressedIcon(new javax.swing.ImageIcon(getClass().getResource("/img/pressed_prof.png"))); // NOI18N
        jButton1.setRolloverIcon(new javax.swing.ImageIcon(getClass().getResource("/img/pressed_prof.png"))); // NOI18N
        jButton1.setRolloverSelectedIcon(new javax.swing.ImageIcon(getClass().getResource("/img/pressed_prof.png"))); // NOI18N
        jButton1.addMouseListener(new java.awt.event.MouseAdapter() {
            public void mousePressed(java.awt.event.MouseEvent evt) {
                jButton1MousePressed(evt);
            }
        });
        jButton1.addActionListener(new java.awt.event.ActionListener() {
            public void actionPerformed(java.awt.event.ActionEvent evt) {
                jButton1ActionPerformed(evt);
            }
        });

        jButton2.setIcon(new javax.swing.ImageIcon(getClass().getResource("/img/student.png"))); // NOI18N
        jButton2.setCursor(new java.awt.Cursor(java.awt.Cursor.HAND_CURSOR));
        jButton2.setRolloverIcon(new javax.swing.ImageIcon(getClass().getResource("/img/pressed_student.png"))); // NOI18N
        jButton2.setRolloverSelectedIcon(new javax.swing.ImageIcon(getClass().getResource("/img/pressed_student.png"))); // NOI18N
        jButton2.addActionListener(new java.awt.event.ActionListener() {
            public void actionPerformed(java.awt.event.ActionEvent evt) {
                jButton2ActionPerformed(evt);
            }
        });

        jButton3.setIcon(new javax.swing.ImageIcon(getClass().getResource("/img/admin.png"))); // NOI18N
        jButton3.addActionListener(new java.awt.event.ActionListener() {
            public void actionPerformed(java.awt.event.ActionEvent evt) {
                jButton3ActionPerformed(evt);
            }
        });

        jLabel5.setText("Professor");

        jLabel6.setText("Student");

        jLabel7.setText("Admin");

        javax.swing.GroupLayout jPanel3Layout = new javax.swing.GroupLayout(jPanel3);
        jPanel3.setLayout(jPanel3Layout);
        jPanel3Layout.setHorizontalGroup(
            jPanel3Layout.createParallelGroup(javax.swing.GroupLayout.Alignment.LEADING)
            .addGroup(jPanel3Layout.createSequentialGroup()
                .addGap(31, 31, 31)
                .addGroup(jPanel3Layout.createParallelGroup(javax.swing.GroupLayout.Alignment.LEADING)
                    .addComponent(jLabel7)
                    .addComponent(jButton3, javax.swing.GroupLayout.PREFERRED_SIZE, 50, javax.swing.GroupLayout.PREFERRED_SIZE)
                    .addGroup(jPanel3Layout.createParallelGroup(javax.swing.GroupLayout.Alignment.TRAILING, false)
                        .addComponent(jButton1, javax.swing.GroupLayout.Alignment.LEADING, javax.swing.GroupLayout.PREFERRED_SIZE, 0, Short.MAX_VALUE)
                        .addComponent(jLabel5, javax.swing.GroupLayout.Alignment.LEADING, javax.swing.GroupLayout.DEFAULT_SIZE, javax.swing.GroupLayout.DEFAULT_SIZE, Short.MAX_VALUE)
                        .addComponent(jLabel6, javax.swing.GroupLayout.Alignment.LEADING)
                        .addComponent(jButton2, javax.swing.GroupLayout.Alignment.LEADING, javax.swing.GroupLayout.PREFERRED_SIZE, 0, Short.MAX_VALUE)))
                .addGap(68, 68, 68))
        );
        jPanel3Layout.setVerticalGroup(
            jPanel3Layout.createParallelGroup(javax.swing.GroupLayout.Alignment.LEADING)
            .addGroup(jPanel3Layout.createSequentialGroup()
                .addGap(75, 75, 75)
                .addComponent(jButton1, javax.swing.GroupLayout.PREFERRED_SIZE, 50, javax.swing.GroupLayout.PREFERRED_SIZE)
                .addPreferredGap(javax.swing.LayoutStyle.ComponentPlacement.RELATED)
                .addComponent(jLabel5)
                .addGap(18, 18, 18)
                .addComponent(jButton2, javax.swing.GroupLayout.PREFERRED_SIZE, 50, javax.swing.GroupLayout.PREFERRED_SIZE)
                .addPreferredGap(javax.swing.LayoutStyle.ComponentPlacement.RELATED)
                .addComponent(jLabel6)
                .addGap(18, 18, 18)
                .addComponent(jButton3, javax.swing.GroupLayout.PREFERRED_SIZE, 50, javax.swing.GroupLayout.PREFERRED_SIZE)
                .addPreferredGap(javax.swing.LayoutStyle.ComponentPlacement.RELATED)
                .addComponent(jLabel7)
                .addContainerGap())
        );

        jSplitPane2.setLeftComponent(jPanel3);

        jPanel4.setBackground(new java.awt.Color(224, 25, 44));

        jLabel3.setFont(new java.awt.Font("Segoe UI", 1, 36)); // NOI18N
        jLabel3.setForeground(new java.awt.Color(255, 255, 255));
        jLabel3.setText("WELCOME");

        jLabel1.setFont(new java.awt.Font("Segoe UI Black", 0, 18)); // NOI18N
        jLabel1.setForeground(new java.awt.Color(255, 255, 255));
        jLabel1.setText("e-Learning User Management Portal");

        jLabel2.setFont(new java.awt.Font("Candara Light", 0, 96)); // NOI18N
        jLabel2.setForeground(new java.awt.Color(255, 255, 255));
        jLabel2.setText("I");

        jLabel4.setIcon(new javax.swing.ImageIcon(getClass().getResource("/img/nulogo.png"))); // NOI18N

        husky.setHorizontalAlignment(javax.swing.SwingConstants.RIGHT);
        husky.setIcon(new javax.swing.ImageIcon(getClass().getResource("/img/huskytransparent.png"))); // NOI18N
        husky.setCursor(new java.awt.Cursor(java.awt.Cursor.WAIT_CURSOR));

        husky.setAlignmentX(Component.RIGHT_ALIGNMENT);

        javax.swing.GroupLayout jPanel4Layout = new javax.swing.GroupLayout(jPanel4);
        jPanel4.setLayout(jPanel4Layout);
        jPanel4Layout.setHorizontalGroup(
            jPanel4Layout.createParallelGroup(javax.swing.GroupLayout.Alignment.LEADING)
            .addGroup(jPanel4Layout.createSequentialGroup()
                .addContainerGap(81, Short.MAX_VALUE)
                .addGroup(jPanel4Layout.createParallelGroup(javax.swing.GroupLayout.Alignment.TRAILING)
                    .addComponent(jLabel1)
                    .addComponent(jLabel3))
                .addGap(0, 0, 0)
                .addComponent(jLabel2, javax.swing.GroupLayout.PREFERRED_SIZE, 26, javax.swing.GroupLayout.PREFERRED_SIZE)
                .addPreferredGap(javax.swing.LayoutStyle.ComponentPlacement.RELATED)
                .addComponent(jLabel4, javax.swing.GroupLayout.PREFERRED_SIZE, 220, javax.swing.GroupLayout.PREFERRED_SIZE)
                .addPreferredGap(javax.swing.LayoutStyle.ComponentPlacement.RELATED, 36, Short.MAX_VALUE)
                .addComponent(husky, javax.swing.GroupLayout.PREFERRED_SIZE, 282, javax.swing.GroupLayout.PREFERRED_SIZE))
        );
        jPanel4Layout.setVerticalGroup(
            jPanel4Layout.createParallelGroup(javax.swing.GroupLayout.Alignment.LEADING)
            .addComponent(husky, javax.swing.GroupLayout.DEFAULT_SIZE, javax.swing.GroupLayout.DEFAULT_SIZE, Short.MAX_VALUE)
            .addGroup(javax.swing.GroupLayout.Alignment.TRAILING, jPanel4Layout.createSequentialGroup()
                .addContainerGap(javax.swing.GroupLayout.DEFAULT_SIZE, Short.MAX_VALUE)
                .addGroup(jPanel4Layout.createParallelGroup(javax.swing.GroupLayout.Alignment.LEADING)
                    .addGroup(jPanel4Layout.createSequentialGroup()
                        .addGap(10, 10, 10)
                        .addGroup(jPanel4Layout.createParallelGroup(javax.swing.GroupLayout.Alignment.LEADING)
                            .addComponent(jLabel2)
                            .addGroup(jPanel4Layout.createSequentialGroup()
                                .addComponent(jLabel3, javax.swing.GroupLayout.PREFERRED_SIZE, 35, javax.swing.GroupLayout.PREFERRED_SIZE)
                                .addPreferredGap(javax.swing.LayoutStyle.ComponentPlacement.UNRELATED)
                                .addComponent(jLabel1))))
                    .addComponent(jLabel4, javax.swing.GroupLayout.PREFERRED_SIZE, 100, javax.swing.GroupLayout.PREFERRED_SIZE))
                .addGap(307, 307, 307))
        );

        jSplitPane2.setRightComponent(jPanel4);

        javax.swing.GroupLayout layout = new javax.swing.GroupLayout(getContentPane());
        getContentPane().setLayout(layout);
        layout.setHorizontalGroup(
            layout.createParallelGroup(javax.swing.GroupLayout.Alignment.LEADING)
            .addComponent(jSplitPane2)
        );
        layout.setVerticalGroup(
            layout.createParallelGroup(javax.swing.GroupLayout.Alignment.LEADING)
            .addComponent(jSplitPane2)
        );

        pack();
    }// </editor-fold>//GEN-END:initComponents

    private void jButton1ActionPerformed(java.awt.event.ActionEvent evt) {//GEN-FIRST:event_jButton1ActionPerformed
        ProfessorFirst professor = new ProfessorFirst(professordirectory, courseDirectory );
        jSplitPane2.setRightComponent(professor);
    }//GEN-LAST:event_jButton1ActionPerformed

    private void jButton3ActionPerformed(java.awt.event.ActionEvent evt) {//GEN-FIRST:event_jButton3ActionPerformed
        AdminPanel admin = new AdminPanel(professordirectory, courseDirectory);
        jSplitPane2.setRightComponent(admin);
    }//GEN-LAST:event_jButton3ActionPerformed

    private void jButton2ActionPerformed(java.awt.event.ActionEvent evt) {//GEN-FIRST:event_jButton2ActionPerformed
        Student_UI studentpanel = new Student_UI(studentCatalogue, courseDirectory, professordirectory, choosedcoursecatalogue);
        jSplitPane2.setRightComponent(studentpanel);
    }//GEN-LAST:event_jButton2ActionPerformed

    private void jButton1MousePressed(java.awt.event.MouseEvent evt) {//GEN-FIRST:event_jButton1MousePressed
        // TODO add your handling code here:
    }//GEN-LAST:event_jButton1MousePressed

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
    private javax.swing.JLabel husky;
    private javax.swing.JButton jButton1;
    private javax.swing.JButton jButton2;
    private javax.swing.JButton jButton3;
    private javax.swing.JLabel jLabel1;
    private javax.swing.JLabel jLabel2;
    private javax.swing.JLabel jLabel3;
    private javax.swing.JLabel jLabel4;
    private javax.swing.JLabel jLabel5;
    private javax.swing.JLabel jLabel6;
    private javax.swing.JLabel jLabel7;
    private javax.swing.JPanel jPanel3;
    private javax.swing.JPanel jPanel4;
    private javax.swing.JSplitPane jSplitPane2;
    // End of variables declaration//GEN-END:variables
}
