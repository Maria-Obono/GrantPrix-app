
import { CONFERENCES } from '../src/constants';
import { verifyGrantStatus } from '../src/services/gemini';

// Ensure API key is set for the script environment
if (!process.env.GEMINI_API_KEY && process.env.API_KEY) {
  process.env.GEMINI_API_KEY = process.env.API_KEY;
}

async function verifyAll() {
  if (!process.env.GEMINI_API_KEY) {
    console.error("Error: GEMINI_API_KEY or API_KEY environment variable is not set.");
    return;
  }
  console.log(`Verifying ${CONFERENCES.length} conferences...`);
  const results = [];
  
  for (const conf of CONFERENCES) {
    console.log(`Checking ${conf.name}...`);
    const status = await verifyGrantStatus(conf.name, conf.applicationUrl);
    results.push({
      name: conf.name,
      ...status
    });
    // Small delay to avoid rate limits if any
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n--- Verification Results ---');
  console.log(JSON.stringify(results, null, 2));
}

verifyAll().catch(console.error);
