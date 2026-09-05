import { prepareOwnerSetup } from '../src/server/auth/privateState.js';

const paths = prepareOwnerSetup(process.env.VILLAGE_AUTH_DIR);
console.log(`Owner enrollment code saved privately to ${paths.bootstrapPath}`);
console.log('Open this file locally, paste its code into the locked village, and create your passkey within 15 minutes.');
console.log(`Observation header saved privately to ${paths.hookHeaderPath}`);
console.log('The setup command never prints either secret. Existing owner enrollment cannot be overwritten.');
