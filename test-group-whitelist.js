// Test script untuk cek group whitelist matching
require('dotenv').config();

const groupNamesStr = process.env.BOT_GROUP_NAMES || "";
const groupNames = groupNamesStr.split(',').map(name => name.trim().toLowerCase().replace(/\s+/g, ' ')).filter(name => name);

console.log('📋 Configured Group Names (from .env):');
console.log('BOT_GROUP_NAMES:', process.env.BOT_GROUP_NAMES);
console.log('');
console.log('✅ Parsed and Normalized Group Names:');
groupNames.forEach((name, idx) => {
    console.log(`${idx + 1}. "${name}"`);
});

console.log('\n='.repeat(60));
console.log('🔍 Testing Group Name Matching:\n');

// Test dengan nama grup dari screenshot
const testGroupNames = [
    'Ress Zoom & Netflix GH',
    'Ress Baru GH Zoom Netflix',
    'GH bot BARU',
    'GH Zoom Netflix',  // Possible variant
    'Vinstuff Gallery',  // Dari screenshot
    'NETFLIX RESS GH bot BARU', // Another possible name
];

testGroupNames.forEach(testName => {
    const normalized = testName.toLowerCase().trim().replace(/\s+/g, ' ');
    const isAllowed = groupNames.some(allowedName => {
        return normalized === allowedName;
    });

    console.log(`Group: "${testName}"`);
    console.log(`  Normalized: "${normalized}"`);
    console.log(`  Status: ${isAllowed ? '✅ ALLOWED' : '❌ BLOCKED'}`);
    if (!isAllowed && groupNames.length > 0) {
        console.log(`  Closest match: "${groupNames[0]}"`);
    }
    console.log('');
});

console.log('='.repeat(60));
console.log('\n💡 SOLUTION OPTIONS:\n');
console.log('1. Add the actual group name to BOT_GROUP_NAMES in .env');
console.log('2. Disable group whitelist by removing BOT_GROUP_NAMES from .env');
console.log('3. Use BOT_GROUP_LINKS instead (more reliable than names)');
console.log('\nTo disable whitelist, edit .env and comment out:');
console.log('# BOT_GROUP_NAMES=...');
