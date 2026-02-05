/**
 * FRONTEND DEBUGGING SCRIPT
 * Run this in the browser console while using the frontend app
 * 
 * This will help identify if the issue is:
 * 1. No token in storage
 * 2. Token expired
 * 3. Not sending token with requests
 * 4. Wrong user role
 */

// ==================================================
// 1. CHECK TOKEN IN STORAGE
// ==================================================
console.log('=== TOKEN STORAGE CHECK ===');
const token = localStorage.getItem('accessToken');
const user = JSON.parse(localStorage.getItem('user') || '{}');

if (token) {
  console.log('✅ Token found in localStorage');
  console.log('Token preview:', token.substring(0, 50) + '...');
} else {
  console.log('❌ NO TOKEN - User must login first!');
}

if (user && user.role) {
  console.log('✅ User stored:', { id: user.id, email: user.email, role: user.role });
} else {
  console.log('❌ User not stored correctly');
}

// ==================================================
// 2. VERIFY TOKEN VALIDITY
// ==================================================
console.log('\n=== TOKEN VALIDITY CHECK ===');
if (token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      console.log('❌ Invalid token format - should have 3 parts separated by dots');
    } else {
      const payload = JSON.parse(atob(parts[1]));
      console.log('✅ Token decoded successfully');
      console.log('Token payload:', {
        userId: payload.id,
        role: payload.role,
        type: payload.type,
        issuedAt: new Date(payload.iat * 1000),
        expiresAt: new Date(payload.exp * 1000),
        isExpired: payload.exp * 1000 < Date.now()
      });
      
      if (payload.exp * 1000 < Date.now()) {
        console.log('⚠️ TOKEN EXPIRED - Call /api/auth/refresh or login again');
      }
    }
  } catch (e) {
    console.log('❌ Token decode error:', e.message);
  }
}

// ==================================================
// 3. TEST API REQUEST WITH PROPER HEADERS
// ==================================================
console.log('\n=== TEST API REQUEST ===');
console.log('Testing GET /api/users with proper authentication...\n');

const testApiCall = async () => {
  const token = localStorage.getItem('accessToken');
  
  if (!token) {
    console.log('❌ NO TOKEN - Cannot make authenticated request');
    return;
  }
  
  try {
    const response = await fetch('http://localhost:5000/api/users', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      credentials: 'include'
    });
    
    console.log('Response status:', response.status);
    const data = await response.json();
    
    if (response.ok) {
      console.log('✅ SUCCESS - API request worked!');
      console.log('Users count:', data.length);
      console.log('Users:', data);
    } else {
      console.log('❌ Error:', data.message);
      console.log('Full response:', data);
    }
  } catch (error) {
    console.log('❌ Network error:', error.message);
  }
};

// Run the test
testApiCall();

// ==================================================
// 4. TEST LOGIN AND RETRY
// ==================================================
console.log('\n=== ALTERNATIVE: TEST LOGIN FLOW ===');

const testLoginFlow = async () => {
  console.log('Testing login flow...\n');
  
  const response = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@example.com',  // Change to actual admin email
      password: 'password123'      // Change to actual password
    }),
    credentials: 'include'
  });
  
  const data = await response.json();
  
  if (response.ok) {
    console.log('✅ Login successful');
    console.log('User:', data.user);
    console.log('Access token (first 50 chars):', data.accessToken.substring(0, 50) + '...');
    
    // Now try to use the token
    console.log('\nRetrying /api/users with new token...\n');
    const usersResponse = await fetch('http://localhost:5000/api/users', {
      headers: {
        'Authorization': `Bearer ${data.accessToken}`,
        'Content-Type': 'application/json'
      },
      credentials: 'include'
    });
    
    if (usersResponse.ok) {
      const users = await usersResponse.json();
      console.log('✅ Users API works:', users.length, 'users');
    } else {
      console.log('❌ Users API failed:', usersResponse.status);
    }
  } else {
    console.log('❌ Login failed:', data.message);
  }
};

// Uncomment to test login:
// testLoginFlow();

// ==================================================
// 5. CHECK API CLIENT CONFIGURATION
// ==================================================
console.log('\n=== API CLIENT CONFIGURATION ===');
console.log('Common issues to check:');
console.log('1. Is baseURL set to http://localhost:5000?');
console.log('2. Is credentials: "include" set for cookie-based auth?');
console.log('3. Are headers including Authorization: Bearer <token>?');
console.log('4. Is the token being retrieved from localStorage correctly?');
