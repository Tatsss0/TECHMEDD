/**
 * Firestore Data Migration Script
 * Migrates data from old structure to new users/{userType}/{uid} structure
 * 
 * OLD STRUCTURE:
 * - doctors/{uid}
 * - patients/{uid}
 * - secretaries/{uid}
 * 
 * NEW STRUCTURE:
 * - users/doctors/{uid}
 * - users/patients/{uid}
 * - users/secretaries/{uid}
 * 
 * USAGE:
 * 1. Run this in Firebase Console (Firestore > Rules > Test Rules)
 * 2. Or use Firebase Admin SDK in Node.js environment
 */

// For Firebase Console (use this version)
async function migrateFirestoreData() {
  console.log('🚀 Starting Firestore data migration...');
  
  try {
    // Get references to old collections
    const doctorsRef = firebase.firestore().collection('doctors');
    const patientsRef = firebase.firestore().collection('patients');
    const secretariesRef = firebase.firestore().collection('secretaries');
    
    // Migration counters
    let migratedDoctors = 0;
    let migratedPatients = 0;
    let migratedSecretaries = 0;
    let errors = [];

    // MIGRATE DOCTORS
    console.log('📋 Migrating doctors...');
    const doctorsSnapshot = await doctorsRef.get();
    
    for (const doc of doctorsSnapshot.docs) {
      try {
        const data = doc.data();
        const newDocRef = firebase.firestore().collection('users/doctors').doc(doc.id);
        
        // Check if already migrated
        const existingDoc = await newDocRef.get();
        if (!existingDoc.exists) {
          await newDocRef.set({
            ...data,
            migratedAt: firebase.firestore.FieldValue.serverTimestamp(),
            migratedFrom: 'doctors'
          });
          migratedDoctors++;
          console.log(`✅ Migrated doctor: ${doc.id}`);
        } else {
          console.log(`⏭️ Doctor already migrated: ${doc.id}`);
        }
      } catch (error) {
        console.error(`❌ Error migrating doctor ${doc.id}:`, error);
        errors.push(`Doctor ${doc.id}: ${error.message}`);
      }
    }

    // MIGRATE PATIENTS
    console.log('📋 Migrating patients...');
    const patientsSnapshot = await patientsRef.get();
    
    for (const doc of patientsSnapshot.docs) {
      try {
        const data = doc.data();
        const newDocRef = firebase.firestore().collection('users/patients').doc(doc.id);
        
        // Check if already migrated
        const existingDoc = await newDocRef.get();
        if (!existingDoc.exists) {
          await newDocRef.set({
            ...data,
            migratedAt: firebase.firestore.FieldValue.serverTimestamp(),
            migratedFrom: 'patients'
          });
          migratedPatients++;
          console.log(`✅ Migrated patient: ${doc.id}`);
          
          // Migrate patient subcollections (consultations, prescriptions)
          await migratePatientSubcollections(doc.id);
          
        } else {
          console.log(`⏭️ Patient already migrated: ${doc.id}`);
        }
      } catch (error) {
        console.error(`❌ Error migrating patient ${doc.id}:`, error);
        errors.push(`Patient ${doc.id}: ${error.message}`);
      }
    }

    // MIGRATE SECRETARIES
    console.log('📋 Migrating secretaries...');
    const secretariesSnapshot = await secretariesRef.get();
    
    for (const doc of secretariesSnapshot.docs) {
      try {
        const data = doc.data();
        const newDocRef = firebase.firestore().collection('users/secretaries').doc(doc.id);
        
        // Check if already migrated
        const existingDoc = await newDocRef.get();
        if (!existingDoc.exists) {
          await newDocRef.set({
            ...data,
            migratedAt: firebase.firestore.FieldValue.serverTimestamp(),
            migratedFrom: 'secretaries'
          });
          migratedSecretaries++;
          console.log(`✅ Migrated secretary: ${doc.id}`);
        } else {
          console.log(`⏭️ Secretary already migrated: ${doc.id}`);
        }
      } catch (error) {
        console.error(`❌ Error migrating secretary ${doc.id}:`, error);
        errors.push(`Secretary ${doc.id}: ${error.message}`);
      }
    }

    // MIGRATION SUMMARY
    console.log('\n🎉 Migration completed!');
    console.log(`📊 Summary:`);
    console.log(`   - Doctors migrated: ${migratedDoctors}`);
    console.log(`   - Patients migrated: ${migratedPatients}`);
    console.log(`   - Secretaries migrated: ${migratedSecretaries}`);
    console.log(`   - Total migrated: ${migratedDoctors + migratedPatients + migratedSecretaries}`);
    
    if (errors.length > 0) {
      console.log(`\n⚠️ Errors encountered:`);
      errors.forEach(error => console.log(`   - ${error}`));
    }
    
    return {
      success: true,
      migrated: {
        doctors: migratedDoctors,
        patients: migratedPatients,
        secretaries: migratedSecretaries,
        total: migratedDoctors + migratedPatients + migratedSecretaries
      },
      errors: errors
    };

  } catch (error) {
    console.error('💥 Migration failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Helper function to migrate patient subcollections
async function migratePatientSubcollections(patientId) {
  try {
    const oldPatientRef = firebase.firestore().collection('patients').doc(patientId);
    const newPatientRef = firebase.firestore().collection('users/patients').doc(patientId);
    
    // Migrate consultations
    const consultationsSnapshot = await oldPatientRef.collection('consultations').get();
    for (const consultationDoc of consultationsSnapshot.docs) {
      const newConsultationRef = newPatientRef.collection('consultations').doc(consultationDoc.id);
      const existingConsultation = await newConsultationRef.get();
      
      if (!existingConsultation.exists) {
        await newConsultationRef.set({
          ...consultationDoc.data(),
          migratedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        console.log(`  ✅ Migrated consultation: ${consultationDoc.id}`);
      }
    }
    
    // Migrate prescriptions
    const prescriptionsSnapshot = await oldPatientRef.collection('prescriptions').get();
    for (const prescriptionDoc of prescriptionsSnapshot.docs) {
      const newPrescriptionRef = newPatientRef.collection('prescriptions').doc(prescriptionDoc.id);
      const existingPrescription = await newPrescriptionRef.get();
      
      if (!existingPrescription.exists) {
        await newPrescriptionRef.set({
          ...prescriptionDoc.data(),
          migratedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        console.log(`  ✅ Migrated prescription: ${prescriptionDoc.id}`);
      }
    }
    
  } catch (error) {
    console.error(`❌ Error migrating subcollections for patient ${patientId}:`, error);
  }
}

// Verification function to check migration results
async function verifyMigration() {
  console.log('🔍 Verifying migration...');
  
  try {
    const oldDoctors = await firebase.firestore().collection('doctors').get();
    const newDoctors = await firebase.firestore().collection('users/doctors').get();
    
    const oldPatients = await firebase.firestore().collection('patients').get();
    const newPatients = await firebase.firestore().collection('users/patients').get();
    
    const oldSecretaries = await firebase.firestore().collection('secretaries').get();
    const newSecretaries = await firebase.firestore().collection('users/secretaries').get();
    
    console.log('📊 Verification Results:');
    console.log(`   Old doctors: ${oldDoctors.size} → New doctors: ${newDoctors.size}`);
    console.log(`   Old patients: ${oldPatients.size} → New patients: ${newPatients.size}`);
    console.log(`   Old secretaries: ${oldSecretaries.size} → New secretaries: ${newSecretaries.size}`);
    
    const allMigrated = (
      oldDoctors.size === newDoctors.size &&
      oldPatients.size === newPatients.size &&
      oldSecretaries.size === newSecretaries.size
    );
    
    if (allMigrated) {
      console.log('✅ All data successfully migrated!');
    } else {
      console.log('⚠️ Some data may not have been migrated. Please check manually.');
    }
    
    return allMigrated;
    
  } catch (error) {
    console.error('❌ Verification failed:', error);
    return false;
  }
}

// Cleanup function (DANGEROUS - use with caution)
async function cleanupOldCollections() {
  console.log('⚠️ WARNING: This will delete old collections!');
  console.log('Make sure migration is verified before running this.');
  
  // Uncomment the lines below ONLY after verifying migration
  /*
  const batch = firebase.firestore().batch();
  
  // Delete old doctors
  const oldDoctors = await firebase.firestore().collection('doctors').get();
  oldDoctors.forEach(doc => batch.delete(doc.ref));
  
  // Delete old patients (and their subcollections)
  const oldPatients = await firebase.firestore().collection('patients').get();
  oldPatients.forEach(doc => batch.delete(doc.ref));
  
  // Delete old secretaries
  const oldSecretaries = await firebase.firestore().collection('secretaries').get();
  oldSecretaries.forEach(doc => batch.delete(doc.ref));
  
  await batch.commit();
  console.log('🗑️ Old collections cleaned up');
  */
  
  console.log('Cleanup function is commented out for safety. Uncomment after verification.');
}

// Export functions for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    migrateFirestoreData,
    verifyMigration,
    cleanupOldCollections
  };
}

// Auto-run migration if in browser console
if (typeof window !== 'undefined') {
  console.log('🔧 Firestore Migration Script Loaded');
  console.log('Run: migrateFirestoreData() to start migration');
  console.log('Run: verifyMigration() to check results');
}
