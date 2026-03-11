import requests
import sys
import json
from datetime import datetime
from typing import Dict, List, Any

class ATSPulseAPITester:
    def __init__(self, base_url="https://ats-pulse-1.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0
        self.failed_tests = []
        self.created_companies = []
        
    def log_result(self, test_name: str, success: bool, details: str = ""):
        """Log test results"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {test_name}: PASSED {details}")
        else:
            self.failed_tests.append(f"{test_name}: {details}")
            print(f"❌ {test_name}: FAILED {details}")

    def run_test(self, name: str, method: str, endpoint: str, expected_status: int, 
                 data: Dict = None, params: Dict = None) -> tuple:
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        if data:
            print(f"   Data: {json.dumps(data, indent=2)}")
        if params:
            print(f"   Params: {params}")
            
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, params=params, timeout=30)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=30)
            elif method == 'PATCH':
                response = requests.patch(url, json=data, headers=headers, timeout=30)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=30)
                
            success = response.status_code == expected_status
            
            if success:
                self.log_result(name, True, f"Status: {response.status_code}")
                try:
                    return True, response.json()
                except:
                    return True, response.text
            else:
                error_detail = ""
                try:
                    error_data = response.json()
                    error_detail = f"Error: {error_data}"
                except:
                    error_detail = f"Response: {response.text[:200]}"
                    
                self.log_result(name, False, f"Expected {expected_status}, got {response.status_code}. {error_detail}")
                return False, {}
                
        except requests.exceptions.RequestException as e:
            self.log_result(name, False, f"Request failed: {str(e)}")
            return False, {}
        except Exception as e:
            self.log_result(name, False, f"Unexpected error: {str(e)}")
            return False, {}

    def test_root_endpoint(self):
        """Test the root API endpoint"""
        success, response = self.run_test(
            "Root endpoint",
            "GET", 
            "",
            200
        )
        return success

    def test_get_companies(self):
        """Test GET /api/companies endpoint"""
        success, response = self.run_test(
            "GET companies list",
            "GET",
            "companies", 
            200
        )
        
        if success and isinstance(response, list):
            print(f"   📊 Found {len(response)} companies")
            
            # Check if companies are grouped by ATS type as expected
            ats_types = {}
            for company in response:
                ats_type = company.get('ats_type', 'unknown')
                if ats_type not in ats_types:
                    ats_types[ats_type] = 0
                ats_types[ats_type] += 1
                
            print(f"   📋 Companies by ATS type: {ats_types}")
            
            # Verify expected fields exist
            if response:
                sample_company = response[0]
                required_fields = ['id', 'company_slug', 'company_name', 'ats_type', 'api_url', 'is_active']
                missing_fields = [field for field in required_fields if field not in sample_company]
                if missing_fields:
                    self.log_result("Company fields validation", False, f"Missing fields: {missing_fields}")
                else:
                    self.log_result("Company fields validation", True, "All required fields present")
        
        return success, response if success else []

    def test_create_company(self):
        """Test POST /api/companies endpoint"""
        test_company = {
            "company_slug": f"test-company-{datetime.now().strftime('%H%M%S')}",
            "company_name": "Test Company",
            "ats_type": "greenhouse", 
            "api_url": "https://boards-api.greenhouse.io/v1/boards/test-company/jobs",
            "is_active": True
        }
        
        success, response = self.run_test(
            "POST create company",
            "POST",
            "companies",
            200,  # Backend returns 200 instead of 201
            data=test_company
        )
        
        if success and isinstance(response, dict):
            company_id = response.get('id')
            if company_id:
                self.created_companies.append(company_id)
                print(f"   📝 Created company ID: {company_id}")
            return success, response
        
        return success, {}

    def test_update_company(self, company_id: str):
        """Test PATCH /api/companies/{id} endpoint"""
        update_data = {"is_active": False}
        
        success, response = self.run_test(
            "PATCH toggle company active status",
            "PATCH",
            f"companies/{company_id}",
            200,
            data=update_data
        )
        
        if success and isinstance(response, dict):
            if response.get('is_active') == False:
                print(f"   ✅ Successfully toggled company to inactive")
            else:
                self.log_result("Company toggle verification", False, "is_active field not updated correctly")
        
        return success

    def test_delete_company(self, company_id: str):
        """Test DELETE /api/companies/{id} endpoint"""
        success, response = self.run_test(
            "DELETE company",
            "DELETE",
            f"companies/{company_id}",
            200
        )
        
        if success:
            print(f"   🗑️ Successfully deleted company {company_id}")
        
        return success

    def test_get_jobs(self):
        """Test GET /api/jobs endpoint"""
        success, response = self.run_test(
            "GET jobs list",
            "GET",
            "jobs",
            200
        )
        
        if success and isinstance(response, dict):
            data = response.get('data', [])
            meta = response.get('meta', {})
            
            print(f"   📊 Found {len(data)} jobs")
            print(f"   📈 Total jobs: {meta.get('total', 0)}")
            print(f"   📄 Pagination: limit={meta.get('limit')}, offset={meta.get('offset')}")
            
            # Verify job structure
            if data:
                sample_job = data[0]
                required_fields = ['company_slug', 'source_ats', 'job_id', 'title', 'location', 'is_remote']
                missing_fields = [field for field in required_fields if field not in sample_job]
                if missing_fields:
                    self.log_result("Job fields validation", False, f"Missing fields: {missing_fields}")
                else:
                    self.log_result("Job fields validation", True, "All required fields present")
                    
                print(f"   📋 Sample job: {sample_job.get('title', 'N/A')} at {sample_job.get('company_slug', 'N/A')}")
        
        return success, response if success else {}

    def test_get_jobs_remote_filter(self):
        """Test GET /api/jobs?remote=true endpoint"""
        success, response = self.run_test(
            "GET jobs with remote filter",
            "GET",
            "jobs",
            200,
            params={"remote": "true", "limit": "10"}
        )
        
        if success and isinstance(response, dict):
            data = response.get('data', [])
            print(f"   🏠 Found {len(data)} remote jobs")
            
            # Verify all returned jobs are remote
            non_remote_jobs = [job for job in data if not job.get('is_remote', False)]
            if non_remote_jobs:
                self.log_result("Remote filter validation", False, f"Found {len(non_remote_jobs)} non-remote jobs in remote filter")
            else:
                self.log_result("Remote filter validation", True, "All jobs correctly filtered as remote")
        
        return success

    def test_get_jobs_title_filter(self):
        """Test GET /api/jobs?title=engineer endpoint"""
        success, response = self.run_test(
            "GET jobs with title filter",
            "GET", 
            "jobs",
            200,
            params={"title": "engineer", "limit": "10"}
        )
        
        if success and isinstance(response, dict):
            data = response.get('data', [])
            print(f"   🔍 Found {len(data)} jobs matching 'engineer'")
            
            # Verify titles contain "engineer"
            if data:
                matching_jobs = [job for job in data if 'engineer' in job.get('title', '').lower()]
                print(f"   ✅ {len(matching_jobs)}/{len(data)} jobs contain 'engineer' in title")
        
        return success

    def test_get_stats(self):
        """Test GET /api/stats endpoint"""
        success, response = self.run_test(
            "GET stats",
            "GET",
            "stats",
            200
        )
        
        if success and isinstance(response, dict):
            required_fields = ['total_jobs', 'active_companies', 'fresh_jobs']
            for field in required_fields:
                if field in response:
                    print(f"   📊 {field}: {response[field]}")
                else:
                    self.log_result("Stats field validation", False, f"Missing field: {field}")
                    
            if all(field in response for field in required_fields):
                self.log_result("Stats field validation", True, "All required stats fields present")
        
        return success

    def test_crawl_endpoint(self):
        """Test POST /api/internal/crawl endpoint"""
        print(f"\n🚨 WARNING: This will trigger a real crawl - it may take time and fetch live data")
        
        success, response = self.run_test(
            "POST internal crawl",
            "POST",
            "internal/crawl",
            200
        )
        
        if success and isinstance(response, dict):
            print(f"   🕷️ Crawl status: {response.get('status', 'unknown')}")
            print(f"   🏢 Companies processed: {response.get('companies_processed', 0)}")
            print(f"   📝 New jobs found: {response.get('new_jobs_total', 0)}")
        
        return success

    def cleanup(self):
        """Clean up created test data"""
        print(f"\n🧹 Cleaning up {len(self.created_companies)} created companies...")
        for company_id in self.created_companies:
            try:
                requests.delete(f"{self.base_url}/companies/{company_id}", timeout=10)
                print(f"   🗑️ Deleted company {company_id}")
            except:
                print(f"   ❌ Failed to delete company {company_id}")

    def run_all_tests(self):
        """Run comprehensive API tests"""
        print("=" * 60)
        print("🚀 ATS PULSE API TESTING STARTED")
        print("=" * 60)
        
        # Test basic connectivity
        self.test_root_endpoint()
        
        # Test companies endpoints
        companies_success, companies_data = self.test_get_companies()
        
        # Test company CRUD operations  
        create_success, created_company = self.test_create_company()
        if create_success and created_company.get('id'):
            company_id = created_company['id']
            self.test_update_company(company_id)
            # Note: Not deleting yet to test delete endpoint separately
        
        # Test jobs endpoints
        self.test_get_jobs()
        self.test_get_jobs_remote_filter()
        self.test_get_jobs_title_filter()
        
        # Test stats
        self.test_get_stats()
        
        # Test crawl (skipping interactive input for automation)
        print("⏭️ Skipping crawl test for automation")
            
        # Test delete after other operations
        if self.created_companies:
            self.test_delete_company(self.created_companies[0])
            
        # Cleanup remaining test data
        self.cleanup()
        
        # Final results
        print("\n" + "=" * 60)
        print("📊 BACKEND API TEST RESULTS")
        print("=" * 60)
        print(f"Tests run: {self.tests_run}")
        print(f"Tests passed: {self.tests_passed}")
        print(f"Tests failed: {len(self.failed_tests)}")
        print(f"Success rate: {(self.tests_passed/self.tests_run*100):.1f}%" if self.tests_run > 0 else "0%")
        
        if self.failed_tests:
            print(f"\n❌ Failed tests:")
            for failure in self.failed_tests:
                print(f"   - {failure}")
        
        return self.tests_passed == self.tests_run

def main():
    tester = ATSPulseAPITester()
    success = tester.run_all_tests()
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())