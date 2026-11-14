import 'dotenv/config';
import database from '../dist/src/services/database.services.js';
import { initializeStudentSchema } from '../dist/src/services/student-schema.services.js';

try {
  await initializeStudentSchema(database.database);
  const userIndexes = await database.users.listIndexes().toArray();
  const identityIndexes = await database.studentIdentities.listIndexes().toArray();
  console.log(JSON.stringify({
    universities: await database.universities.countDocuments(),
    userPairUnique: userIndexes.some(index => index.name === 'school_code_student_id_unique' && index.unique),
    verifiedPairUnique: identityIndexes.some(index => index.name === 'verified_school_student_unique' && index.unique),
    oneIdentityPerUser: identityIndexes.some(index => index.name === 'one_student_identity_per_user' && index.unique),
  }));
} catch (error) {
  console.error('Student schema setup failed:', { name: error.name, code: error.code });
  if (!error.code) console.error(error.message);
  process.exitCode = 1;
} finally { await database.close(); }
