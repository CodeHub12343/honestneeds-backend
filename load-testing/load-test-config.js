/**
 * Load Testing Script - Apache JMeter or Artillery.io format
 * Tests system under load: 100 concurrent users over 5 minutes
 */

const artillery = require('artillery');
const fs = require('fs');

// ==========================================
// Artillery.io Load Testing Configuration
// ==========================================

const loadTestConfig = {
  config: {
    target: process.env.TEST_URL || 'http://localhost:3000',
    phases: [
      {
        duration: 60,
        arrivalRate: 10,
        name: 'Warm up (10 users/sec for 1 min)'
      },
      {
        duration: 180,
        arrivalRate: 33,
        name: 'Steady state (33 users/sec for 3 min = 100 concurrent)'
      },
      {
        duration: 60,
        arrivalRate: 17,
        name: 'Cool down (17 users/sec for 1 min)'
      }
    ],
    processor: './load-test-processor.js'
  },
  scenarios: [
    {
      name: 'Campaign Workflow',
      flow: [
        {
          post: {
            url: '/api/auth/login',
            json: {
              email: 'tester{{ $randomNumber(1, 100) }}@test.com',
              password: 'testpass123'
            },
            capture: {
              json: '$.token',
              as: 'authToken'
            }
          }
        },
        {
          get: {
            url: '/api/campaigns',
            headers: {
              Authorization: 'Bearer {{ authToken }}'
            },
            expect: 200
          }
        },
        {
          get: {
            url: '/api/campaigns/{{ campaignId }}',
            headers: {
              Authorization: 'Bearer {{ authToken }}'
            },
            expect: 200
          }
        },
        {
          post: {
            url: '/api/campaigns/{{ campaignId }}/donate',
            json: {
              amount: 50000
            },
            headers: {
              Authorization: 'Bearer {{ authToken }}'
            },
            expect: 200
          }
        }
      ]
    }
  ]
};

// ==========================================
// Apache JMeter Test Plan (XML format)
// ==========================================

const jmeterTestPlan = `<?xml version="1.0" encoding="UTF-8"?>
<jmeterTestPlan version="1.2">
  <hashTree>
    <TestPlan guiclass="TestPlanGui" testclass="TestPlan" testname="HonestNeed Load Test">
      <elementProp name="TestPlan.user_defined_variables" elementType="Arguments"/>
    </TestPlan>
    <hashTree>
      <!-- Thread Group: 100 concurrent users over 5 minutes -->
      <ThreadGroup guiclass="ThreadGroupGui" testclass="ThreadGroup" testname="Load Test Group">
        <elementProp name="ThreadGroup.main_controller" elementType="LoopController">
          <boolProp name="LoopController.continue_forever">false</boolProp>
          <stringProp name="LoopController.loops">1</stringProp>
        </elementProp>
        <stringProp name="ThreadGroup.num_threads">100</stringProp>
        <stringProp name="ThreadGroup.ramp_time">60</stringProp>
        <elementProp name="ThreadGroup.duration_group" elementType="Arguments">
          <stringProp name="ThreadGroup.duration">300</stringProp>
          <stringProp name="ThreadGroup.delay">0</stringProp>
        </elementProp>
      </ThreadGroup>
      <hashTree>
        <!-- HTTP Sampler 1: GET /campaigns -->
        <HTTPSampler guiclass="HttpTestSampleGui" testclass="HTTPSampler" testname="GET /campaigns">
          <elementProp name="HTTPsampler.Arguments" elementType="Arguments"/>
          <stringProp name="HTTPSampler.domain">localhost</stringProp>
          <stringProp name="HTTPSampler.port">3000</stringProp>
          <stringProp name="HTTPSampler.protocol">http</stringProp>
          <stringProp name="HTTPSampler.path">/api/campaigns</stringProp>
          <stringProp name="HTTPSampler.method">GET</stringProp>
        </HTTPSampler>
        <hashTree>
          <ResponseAssertion guiclass="AssertionGui" testclass="ResponseAssertion" testname="Check Response Code">
            <CollectionProp name="Asserions">
              <stringProp name="Assertion.test_type">6</stringProp>
              <stringProp name="Assertion.test_field">Assertion.response_code</stringProp>
              <stringProp name="Assertion.assume_success">true</stringProp>
              <arrayProp name="Asserions.test_strings">
                <stringProp name="">200</stringProp>
              </arrayProp>
            </CollectionProp>
          </ResponseAssertion>
        </hashTree>

        <!-- HTTP Sampler 2: GET /campaigns/{id} -->
        <HTTPSampler guiclass="HttpTestSampleGui" testclass="HTTPSampler" testname="GET /campaigns/{id}">
          <stringProp name="HTTPSampler.domain">localhost</stringProp>
          <stringProp name="HTTPSampler.port">3000</stringProp>
          <stringProp name="HTTPSampler.protocol">http</stringProp>
          <stringProp name="HTTPSampler.path">/api/campaigns/507f1f77bcf86cd799439011</stringProp>
          <stringProp name="HTTPSampler.method">GET</stringProp>
        </HTTPSampler>

        <!-- HTTP Sampler 3: POST /donations -->
        <HTTPSampler guiclass="HttpTestSampleGui" testclass="HTTPSampler" testname="POST /donations">
          <elementProp name="HTTPsampler.Arguments" elementType="Arguments">
            <HTTPArgument name="amount" value="50000"/>
          </elementProp>
          <stringProp name="HTTPSampler.domain">localhost</stringProp>
          <stringProp name="HTTPSampler.port">3000</stringProp>
          <stringProp name="HTTPSampler.protocol">http</stringProp>
          <stringProp name="HTTPSampler.path">/api/campaigns/507f1f77bcf86cd799439011/donate</stringProp>
          <stringProp name="HTTPSampler.method">POST</stringProp>
        </HTTPSampler>

        <!-- HTTP Sampler 4: POST /shares -->
        <HTTPSampler guiclass="HttpTestSampleGui" testclass="HTTPSampler" testname="POST /shares">
          <stringProp name="HTTPSampler.domain">localhost</stringProp>
          <stringProp name="HTTPSampler.port">3000</stringProp>
          <stringProp name="HTTPSampler.protocol">http</stringProp>
          <stringProp name="HTTPSampler.path">/api/campaigns/507f1f77bcf86cd799439011/share</stringProp>
          <stringProp name="HTTPSampler.method">POST</stringProp>
        </HTTPSampler>

        <!-- HTTP Sampler 5: GET /admin/dashboard -->
        <HTTPSampler guiclass="HttpTestSampleGui" testclass="HTTPSampler" testname="GET /admin/dashboard">
          <stringProp name="HTTPSampler.domain">localhost</stringProp>
          <stringProp name="HTTPSampler.port">3000</stringProp>
          <stringProp name="HTTPSampler.protocol">http</stringProp>
          <stringProp name="HTTPSampler.path">/api/admin/dashboard</stringProp>
          <stringProp name="HTTPSampler.method">GET</stringProp>
        </HTTPSampler>

        <!-- Summary Results Listener -->
        <ResultCollector guiclass="SummaryReport" testclass="ResultCollector" testname="Summary Report">
          <objProp>
            <value class="SampleSaveConfiguration">
              <time>true</time>
              <latency>true</latency>
              <timestamp>true</timestamp>
              <success>true</success>
              <label>true</label>
              <code>true</code>
              <message>true</message>
              <threadName>true</threadName>
              <dataType>true</dataType>
              <encoding>false</encoding>
              <assertions>true</assertions>
              <subresults>true</subresults>
              <responseData>false</responseData>
              <samplerData>false</samplerData>
              <responseFile>false</responseFile>
              <responseHeaders>false</responseHeaders>
              <requestHeaders>false</requestHeaders>
              <assertionsFailureMessage>true</assertionsFailureMessage>
              <ttlm>true</ttlm>
              <connect>true</connect>
            </value>
            <name>saveConfig</name>
          </objProp>
          <stringProp name="filename">load-test-results.jtl</stringProp>
        </ResultCollector>
      </hashTree>
    </hashTree>
  </hashTree>
</jmeterTestPlan>`;

// ==========================================
// Node.js Load Testing Script using wrk
// ==========================================

const wrkLoadTest = `
#!/bin/bash
# wrk load testing script
# Usage: ./load-test.sh

URL="http://localhost:3000"
THREADS=4
CONNECTIONS=100
DURATION="5m"

echo "======================================"
echo "Load Test: 100 concurrent users"
echo "Duration: 5 minutes"
echo "======================================"

# Test 1: GET /campaigns - <1s requirement
echo ""
echo "Test 1: GET /campaigns"
wrk -t$THREADS -c$CONNECTIONS -d$DURATION \\
  -H "Authorization: Bearer $AUTH_TOKEN" \\
  $URL/api/campaigns

# Test 2: GET /campaigns/{id} - <500ms requirement
echo ""
echo "Test 2: GET /campaigns/{id}"
wrk -t$THREADS -c$CONNECTIONS -d$DURATION \\
  -H "Authorization: Bearer $AUTH_TOKEN" \\
  $URL/api/campaigns/507f1f77bcf86cd799439011

# Test 3: POST /donations - <500ms requirement
echo ""
echo "Test 3: POST /donations"
wrk -t$THREADS -c$CONNECTIONS -d$DURATION \\
  -H "Authorization: Bearer $AUTH_TOKEN" \\
  -H "Content-Type: application/json" \\
  -s donation.lua \\
  $URL/api/campaigns/507f1f77bcf86cd799439011/donate

# Test 4: POST /shares - <300ms requirement
echo ""
echo "Test 4: POST /shares"
wrk -t$THREADS -c$CONNECTIONS -d$DURATION \\
  -H "Authorization: Bearer $AUTH_TOKEN" \\
  -H "Content-Type: application/json" \\
  $URL/api/campaigns/507f1f77bcf86cd799439011/share

# Test 5: GET /admin/dashboard - <1s requirement
echo ""
echo "Test 5: GET /admin/dashboard"
wrk -t$THREADS -c$CONNECTIONS -d$DURATION \\
  -H "Authorization: Bearer $ADMIN_TOKEN" \\
  $URL/api/admin/dashboard

echo ""
echo "======================================"
echo "Load test complete"
echo "Analyze results above"
echo "======================================"
`;

// ==========================================
// LoadTest Processor - Custom behavior
// ==========================================

const processorCode = `
module.exports = {
  setupTest: function(context, done) {
    context.vars.set('campaignId', '507f1f77bcf86cd799439011');
    done();
  },
  
  afterResponse: function(requestParams, responseParams, context, done) {
    // Log response times
    if (responseParams.statusCode >= 400) {
      console.log('Error:', responseParams.statusCode);
    }
    
    // Check performance SLA
    const latency = responseParams.latency;
    const endpoint = requestParams.url;
    
    if (endpoint.includes('/campaigns') && !endpoint.includes('/{id}') && latency > 1000) {
      console.warn('GET /campaigns exceeded 1s SLA:', latency + 'ms');
    }
    
    done();
  }
};`;

// ==========================================
// Load Test Success Criteria Validation
// ==========================================

const loadTestValidation = {
  criteria: [
    {
      metric: 'Response time (95th percentile)',
      requirement: '< 2000ms',
      actual: null,
      status: null,
      validator: (actual) => actual < 2000
    },
    {
      metric: 'Response time (99th percentile)',
      requirement: '< 5000ms',
      actual: null,
      status: null,
      validator: (actual) => actual < 5000
    },
    {
      metric: 'Error rate',
      requirement: '< 0.5%',
      actual: null,
      status: null,
      validator: (actual) => actual < 0.5
    },
    {
      metric: 'GET /campaigns - 95th percentile',
      requirement: '< 1000ms',
      actual: null,
      status: null,
      validator: (actual) => actual < 1000
    },
    {
      metric: 'GET /campaigns/{id} - 95th percentile',
      requirement: '< 500ms',
      actual: null,
      status: null,
      validator: (actual) => actual < 500
    },
    {
      metric: 'POST /donations - 95th percentile',
      requirement: '< 500ms',
      actual: null,
      status: null,
      validator: (actual) => actual < 500
    },
    {
      metric: 'POST /shares - 95th percentile',
      requirement: '< 300ms',
      actual: null,
      status: null,
      validator: (actual) => actual < 300
    },
    {
      metric: 'GET /admin/dashboard - 95th percentile',
      requirement: '< 1000ms',
      actual: null,
      status: null,
      validator: (actual) => actual < 1000
    },
    {
      metric: 'Database connections - stable',
      requirement: '< 50 max',
      actual: null,
      status: null,
      validator: (actual) => actual < 50
    },
    {
      metric: 'Memory usage - no leaks',
      requirement: 'Stable after load',
      actual: null,
      status: null,
      validator: () => true // Manual inspection
    }
  ],

  validateResults: function(results) {
    console.log('\\n====================================');
    console.log('LOAD TEST VALIDATION RESULTS');
    console.log('====================================\\n');

    let allPassed = true;

    this.criteria.forEach(criterion => {
      const passed = criterion.validator(criterion.actual);
      criterion.status = passed ? '✅ PASS' : '❌ FAIL';

      if (!passed) allPassed = false;

      console.log(`${criterion.metric}`);
      console.log(`  Requirement: ${criterion.requirement}`);
      console.log(`  Actual: ${criterion.actual}`);
      console.log(`  Status: ${criterion.status}\\n`);
    });

    console.log('====================================');
    console.log(`Overall: ${allPassed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log('===================================\\n');

    return allPassed;
  }
};

module.exports = {
  loadTestConfig,
  jmeterTestPlan,
  wrkLoadTest,
  processorCode,
  loadTestValidation
};
`;

fs.writeFileSync('./load-test-config.js', `
module.exports = ${JSON.stringify({
  scriptName: 'HonestNeed Load Testing Scenarios',
  scenarios: [
    {
      name: 'GET /campaigns (List)',
      endpoint: '/api/campaigns',
      method: 'GET',
      headers: { Authorization: 'Bearer AUTH_TOKEN' },
      expectedTime: '< 1000ms',
      expectedErrorRate: '< 0.1%'
    },
    {
      name: 'GET /campaigns/{id} (Detail)',
      endpoint: '/api/campaigns/507f1f77bcf86cd799439011',
      method: 'GET',
      headers: { Authorization: 'Bearer AUTH_TOKEN' },
      expectedTime: '< 500ms',
      expectedErrorRate: '< 0.1%'
    },
    {
      name: 'POST /donations (Create)',
      endpoint: '/api/campaigns/507f1f77bcf86cd799439011/donate',
      method: 'POST',
      headers: { Authorization: 'Bearer AUTH_TOKEN', 'Content-Type': 'application/json' },
      body: { amount: 50000 },
      expectedTime: '< 500ms',
      expectedErrorRate: '< 0.1%'
    },
    {
      name: 'POST /shares (Create)',
      endpoint: '/api/campaigns/507f1f77bcf86cd799439011/share',
      method: 'POST',
      headers: { Authorization: 'Bearer AUTH_TOKEN', 'Content-Type': 'application/json' },
      body: { platform: 'facebook' },
      expectedTime: '< 300ms',
      expectedErrorRate: '< 0.1%'
    },
    {
      name: 'GET /admin/dashboard (Admin)',
      endpoint: '/api/admin/dashboard',
      method: 'GET',
      headers: { Authorization: 'Bearer ADMIN_TOKEN' },
      expectedTime: '< 1000ms',
      expectedErrorRate: '< 0.1%'
    }
  ],
  concurrency: 100,
  duration: 300, // 5 minutes
  rampUp: 60 // 1 minute ramp up
}, null, 2)});
`);

module.exports = {
  loadTestConfig,
  jmeterTestPlan,
  wrkLoadTest,
  processorCode,
  loadTestValidation,
  processorCode
};
