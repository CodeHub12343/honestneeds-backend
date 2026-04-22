#!/usr/bin/env node
/**
 * RSA Key Generation Script
 * Generates RSA keypair for JWT signing (RS256)
 * 
 * Usage: npm run generate:keys
 * 
 * This script creates:
 * - keys/private.pem (private key - keep secure)
 * - keys/public.pem (public key - can be shared)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// RSA key generation options
const RSA_OPTIONS = {
  modulusLength: 4096,
  publicKeyEncoding: {
    type: 'spki',
    format: 'pem',
  },
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'pem',
  },
};

const keysDir = path.join(__dirname, '../keys');
const privateKeyPath = path.join(keysDir, 'private.pem');
const publicKeyPath = path.join(keysDir, 'public.pem');

// Create keys directory if it doesn't exist
if (!fs.existsSync(keysDir)) {
  fs.mkdirSync(keysDir, { recursive: true });
  console.log(`✓ Created keys directory: ${keysDir}`);
}

// Check if keys already exist
if (fs.existsSync(privateKeyPath) || fs.existsSync(publicKeyPath)) {
  console.log('⚠ RSA keys already exist in keys directory');
  console.log('  Private key: ' + privateKeyPath);
  console.log('  Public key: ' + publicKeyPath);

  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.question('Overwrite existing keys? (y/N): ', (answer) => {
    if (answer.toLowerCase() !== 'y') {
      console.log('Exiting without generating new keys');
      rl.close();
      process.exit(0);
    }

    generateKeys(rl);
  });
} else {
  generateKeys(null);
}

function generateKeys(rl) {
  try {
    console.log('\n🔐 Generating RSA keypair...');
    console.log('   This may take a moment...\n');

    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', RSA_OPTIONS);

    // Write private key
    fs.writeFileSync(privateKeyPath, privateKey, { mode: 0o600 });
    console.log(`✓ Created private key: ${privateKeyPath}`);

    // Write public key
    fs.writeFileSync(publicKeyPath, publicKey, { mode: 0o644 });
    console.log(`✓ Created public key: ${publicKeyPath}`);

    console.log('\n✅ RSA keys generated successfully!\n');
    console.log('Important:');
    console.log('  1. Add keys/private.pem to .gitignore (already added)');
    console.log('  2. For production, store private key in AWS Secrets Manager or similar');
    console.log('  3. Public key can be shared for token verification\n');

    // Show key fingerprint
    const publicKeyObj = crypto.createPublicKey({
      key: publicKey,
      format: 'pem',
    });

    const keyDetails = publicKeyObj.asymmetricKeyDetails;

    console.log('Key Details:');
    console.log(`  Algorithm: RSA`);
    console.log(`  Key size: ${keyDetails.modulusLength} bits`);
    console.log(`  Public exponent: ${keyDetails.publicExponent}`);
    console.log('');

    if (rl) {
      rl.close();
    }
  } catch (error) {
    console.error('❌ Error generating RSA keys:', error.message);
    if (rl) {
      rl.close();
    }
    process.exit(1);
  }
}
