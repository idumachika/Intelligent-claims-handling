import { describe, it, expect, beforeEach } from 'vitest'

// Mock contract interface
class MockInsuranceContract {
  constructor() {
    this.policies = new Map()
    this.providers = new Map()
    this.claims = new Map()
    this.balances = new Map()
    this.authorizedTreatments = new Map()
    this.contractOwner = 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM'
    this.counters = {
      policy: 0,
      provider: 0,
      claim: 0
    }
    this.stats = {
      totalClaimsPaid: 0,
      totalClaimsAmount: 0
    }
    this.currentBlockHeight = 1000
    
    // Initialize default treatments
    this.authorizedTreatments.set('Z00', {
      treatmentName: 'General medical examination',
      maxCoverage: 50000,
      requiresPreauth: false
    })
    this.authorizedTreatments.set('M25', {
      treatmentName: 'Joint disorders',
      maxCoverage: 200000,
      requiresPreauth: true
    })
  }

  createPolicy(sender, policyHolder, premiumAmount, coverageLimit, deductible, durationBlocks) {
    if (sender !== this.contractOwner) {
      return { type: 'error', value: 100 } // err-owner-only
    }
    if (premiumAmount <= 0 || coverageLimit <= 0) {
      return { type: 'error', value: 103 } // err-invalid-amount
    }

    const policyId = ++this.counters.policy
    this.policies.set(policyId, {
      policyHolder,
      premiumAmount,
      coverageLimit,
      deductible,
      expiryDate: this.currentBlockHeight + durationBlocks,
      active: true,
      claimsUsed: 0
    })

    this.balances.set(policyHolder, { balance: 0 })
    return { type: 'ok', value: policyId }
  }

  payPremium(sender, policyId, amount) {
    const policy = this.policies.get(policyId)
    if (!policy) {
      return { type: 'error', value: 101 } // err-not-found
    }
    if (sender !== policy.policyHolder) {
      return { type: 'error', value: 102 } // err-unauthorized
    }
    if (!policy.active) {
      return { type: 'error', value: 107 } // err-expired-policy
    }
    if (amount < policy.premiumAmount) {
      return { type: 'error', value: 103 } // err-invalid-amount
    }

    const currentBalance = this.balances.get(sender) || { balance: 0 }
    this.balances.set(sender, { balance: currentBalance.balance + amount })
    return { type: 'ok', value: true }
  }

  registerProvider(sender, providerAddress, providerName, licenseNumber, specialization) {
    if (sender !== this.contractOwner) {
      return { type: 'error', value: 100 } // err-owner-only
    }

    const providerId = ++this.counters.provider
    this.providers.set(providerId, {
      providerAddress,
      providerName,
      licenseNumber,
      specialization,
      verified: true,
      registrationDate: this.currentBlockHeight
    })

    return { type: 'ok', value: providerId }
  }

  submitClaim(sender, policyId, providerId, claimAmount, treatmentDate, diagnosisCode, treatmentDescription) {
    const policy = this.policies.get(policyId)
    const provider = this.providers.get(providerId)
    
    if (!policy) {
      return { type: 'error', value: 101 } // err-not-found
    }
    if (!provider) {
      return { type: 'error', value: 101 } // err-not-found
    }
    if (sender !== policy.policyHolder) {
      return { type: 'error', value: 102 } // err-unauthorized
    }
    if (!policy.active) {
      return { type: 'error', value: 107 } // err-expired-policy
    }
    if (this.currentBlockHeight >= policy.expiryDate) {
      return { type: 'error', value: 107 } // err-expired-policy
    }
    if (!provider.verified) {
      return { type: 'error', value: 108 } // err-invalid-provider
    }
    if (claimAmount <= 0) {
      return { type: 'error', value: 103 } // err-invalid-amount
    }

    const claimId = ++this.counters.claim
    const claim = {
      policyId,
      claimant: sender,
      providerId,
      claimAmount,
      treatmentDate,
      diagnosisCode,
      treatmentDescription,
      claimStatus: 'submitted',
      submittedDate: this.currentBlockHeight,
      processedDate: null,
      approvedAmount: 0,
      rejectionReason: null
    }

    this.claims.set(claimId, claim)
    this.autoProcessClaim(claimId)
    
    return { type: 'ok', value: claimId }
  }

  autoProcessClaim(claimId) {
    const claim = this.claims.get(claimId)
    const policy = this.policies.get(claim.policyId)
    const treatment = this.authorizedTreatments.get(claim.diagnosisCode)

    if (treatment && 
        !treatment.requiresPreauth && 
        claim.claimAmount <= treatment.maxCoverage &&
        (policy.claimsUsed + claim.claimAmount) <= policy.coverageLimit) {
      
      this.approveClaim(this.contractOwner, claimId, claim.claimAmount)
    } else {
      claim.claimStatus = 'under-review'
      this.claims.set(claimId, claim)
    }
  }

  approveClaim(sender, claimId, approvedAmount) {
    const claim = this.claims.get(claimId)
    if (!claim) {
      return { type: 'error', value: 101 } // err-not-found
    }
    if (sender !== this.contractOwner) {
      return { type: 'error', value: 100 } // err-owner-only
    }
    if (claim.claimStatus !== 'submitted' && claim.claimStatus !== 'under-review') {
      return { type: 'error', value: 104 } // err-already-processed
    }
    if (approvedAmount > claim.claimAmount) {
      return { type: 'error', value: 103 } // err-invalid-amount
    }

    const policy = this.policies.get(claim.policyId)
    const balance = this.balances.get(claim.claimant)
    
    if (!balance || balance.balance < approvedAmount) {
      return { type: 'error', value: 105 } // err-insufficient-funds
    }

    const finalAmount = approvedAmount > policy.deductible ? 
                       approvedAmount - policy.deductible : 0

    claim.claimStatus = 'approved'
    claim.processedDate = this.currentBlockHeight
    claim.approvedAmount = finalAmount
    this.claims.set(claimId, claim)

    policy.claimsUsed += finalAmount
    this.policies.set(claim.policyId, policy)

    balance.balance -= finalAmount
    this.balances.set(claim.claimant, balance)

    this.stats.totalClaimsPaid += 1
    this.stats.totalClaimsAmount += finalAmount

    return { type: 'ok', value: finalAmount }
  }

  rejectClaim(sender, claimId, reason) {
    const claim = this.claims.get(claimId)
    if (!claim) {
      return { type: 'error', value: 101 } // err-not-found
    }
    if (sender !== this.contractOwner) {
      return { type: 'error', value: 100 } // err-owner-only
    }
    if (claim.claimStatus !== 'submitted' && claim.claimStatus !== 'under-review') {
      return { type: 'error', value: 104 } // err-already-processed
    }

    claim.claimStatus = 'rejected'
    claim.processedDate = this.currentBlockHeight
    claim.rejectionReason = reason
    this.claims.set(claimId, claim)

    return { type: 'ok', value: true }
  }

  getPolicy(policyId) {
    return this.policies.get(policyId) || null
  }

  getProvider(providerId) {
    return this.providers.get(providerId) || null
  }

  getClaim(claimId) {
    return this.claims.get(claimId) || null
  }

  getPolicyBalance(policyHolder) {
    return this.balances.get(policyHolder) || null
  }

  getContractStats() {
    return {
      totalPolicies: this.counters.policy,
      totalProviders: this.counters.provider,
      totalClaims: this.counters.claim,
      totalClaimsPaid: this.stats.totalClaimsPaid,
      totalClaimsAmount: this.stats.totalClaimsAmount
    }
  }

  deactivatePolicy(sender, policyId) {
    if (sender !== this.contractOwner) {
      return { type: 'error', value: 100 } // err-owner-only
    }
    const policy = this.policies.get(policyId)
    if (!policy) {
      return { type: 'error', value: 101 } // err-not-found
    }
    
    policy.active = false
    this.policies.set(policyId, policy)
    return { type: 'ok', value: true }
  }

  emergencyClaimOverride(sender, claimId, approvedAmount) {
    if (sender !== this.contractOwner) {
      return { type: 'error', value: 100 } // err-owner-only
    }
    const claim = this.claims.get(claimId)
    if (!claim) {
      return { type: 'error', value: 101 } // err-not-found
    }

    claim.claimStatus = 'emergency-approved'
    claim.processedDate = this.currentBlockHeight
    claim.approvedAmount = approvedAmount
    this.claims.set(claimId, claim)

    this.stats.totalClaimsPaid += 1
    this.stats.totalClaimsAmount += approvedAmount

    return { type: 'ok', value: approvedAmount }
  }
}

describe('Health Insurance Claims Automation Contract', () => {
  let contract
  const contractOwner = 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM'
  const policyHolder = 'ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG'
  const provider = 'ST2JHG361ZXG51QTQTQP1HKZB29NKGCJ7FGJSF3KP'
  const unauthorizedUser = 'ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP'

  beforeEach(() => {
    contract = new MockInsuranceContract()
  })

  describe('Policy Management', () => {
    it('should create a new policy successfully', () => {
      const result = contract.createPolicy(
        contractOwner,
        policyHolder,
        1000,
        50000,
        500,
        1000
      )

      expect(result.type).toBe('ok')
      expect(result.value).toBe(1)
      
      const policy = contract.getPolicy(1)
      expect(policy.policyHolder).toBe(policyHolder)
      expect(policy.premiumAmount).toBe(1000)
      expect(policy.coverageLimit).toBe(50000)
      expect(policy.deductible).toBe(500)
      expect(policy.active).toBe(true)
    })

    it('should fail to create policy if not owner', () => {
      const result = contract.createPolicy(
        unauthorizedUser,
        policyHolder,
        1000,
        50000,
        500,
        1000
      )

      expect(result.type).toBe('error')
      expect(result.value).toBe(100) // err-owner-only
    })

    it('should fail with invalid premium amount', () => {
      const result = contract.createPolicy(
        contractOwner,
        policyHolder,
        0,
        50000,
        500,
        1000
      )

      expect(result.type).toBe('error')
      expect(result.value).toBe(103) // err-invalid-amount
    })

    it('should allow premium payment', () => {
      contract.createPolicy(contractOwner, policyHolder, 1000, 50000, 500, 1000)
      
      const result = contract.payPremium(policyHolder, 1, 1000)
      expect(result.type).toBe('ok')
      
      const balance = contract.getPolicyBalance(policyHolder)
      expect(balance.balance).toBe(1000)
    })

    it('should fail premium payment with insufficient amount', () => {
      contract.createPolicy(contractOwner, policyHolder, 1000, 50000, 500, 1000)
      
      const result = contract.payPremium(policyHolder, 1, 500)
      expect(result.type).toBe('error')
      expect(result.value).toBe(103) // err-invalid-amount
    })

    it('should deactivate policy', () => {
      contract.createPolicy(contractOwner, policyHolder, 1000, 50000, 500, 1000)
      
      const result = contract.deactivatePolicy(contractOwner, 1)
      expect(result.type).toBe('ok')
      
      const policy = contract.getPolicy(1)
      expect(policy.active).toBe(false)
    })
  })

  describe('Provider Management', () => {
    it('should register a new provider successfully', () => {
      const result = contract.registerProvider(
        contractOwner,
        provider,
        'Test Hospital',
        'LIC123456',
        'General Medicine'
      )

      expect(result.type).toBe('ok')
      expect(result.value).toBe(1)
      
      const providerData = contract.getProvider(1)
      expect(providerData.providerAddress).toBe(provider)
      expect(providerData.providerName).toBe('Test Hospital')
      expect(providerData.verified).toBe(true)
    })

    it('should fail to register provider if not owner', () => {
      const result = contract.registerProvider(
        unauthorizedUser,
        provider,
        'Test Hospital',
        'LIC123456',
        'General Medicine'
      )

      expect(result.type).toBe('error')
      expect(result.value).toBe(100) // err-owner-only
    })
  })

  describe('Claims Processing', () => {
    beforeEach(() => {
      // Set up policy and provider
      contract.createPolicy(contractOwner, policyHolder, 1000, 50000, 500, 1000)
      contract.payPremium(policyHolder, 1, 5000)
      contract.registerProvider(contractOwner, provider, 'Test Hospital', 'LIC123456', 'General Medicine')
    })

    it('should submit a claim successfully', () => {
      const result = contract.submitClaim(
        policyHolder,
        1,
        1,
        1000,
        contract.currentBlockHeight,
        'Z00',
        'General medical examination'
      )

      expect(result.type).toBe('ok')
      expect(result.value).toBe(1)
      
      const claim = contract.getClaim(1)
      expect(claim.claimant).toBe(policyHolder)
      expect(claim.claimAmount).toBe(1000)
      expect(claim.claimStatus).toBe('approved') // Should auto-approve for Z00
    })

    it('should auto-approve eligible claims', () => {
      contract.submitClaim(
        policyHolder,
        1,
        1,
        1000,
        contract.currentBlockHeight,
        'Z00',
        'General medical examination'
      )

      const claim = contract.getClaim(1)
      expect(claim.claimStatus).toBe('approved')
      expect(claim.approvedAmount).toBe(500) // 1000 - 500 deductible
    })

    it('should put claims under review for pre-auth treatments', () => {
      contract.submitClaim(
        policyHolder,
        1,
        1,
        5000,
        contract.currentBlockHeight,
        'M25',
        'Joint disorder treatment'
      )

      const claim = contract.getClaim(1)
      expect(claim.claimStatus).toBe('under-review')
    })

    it('should fail claim submission for expired policy', () => {
      contract.currentBlockHeight = 2500 // Beyond policy expiry
      
      const result = contract.submitClaim(
        policyHolder,
        1,
        1,
        1000,
        contract.currentBlockHeight,
        'Z00',
        'General medical examination'
      )

      expect(result.type).toBe('error')
      expect(result.value).toBe(107) // err-expired-policy
    })

    it('should fail claim submission for unverified provider', () => {
      contract.registerProvider(contractOwner, provider, 'Unverified Hospital', 'LIC789', 'Cardiology')
      const unverifiedProvider = contract.getProvider(2)
      unverifiedProvider.verified = false
      contract.providers.set(2, unverifiedProvider)

      const result = contract.submitClaim(
        policyHolder,
        1,
        2,
        1000,
        contract.currentBlockHeight,
        'Z00',
        'General medical examination'
      )

      expect(result.type).toBe('error')
      expect(result.value).toBe(108) // err-invalid-provider
    })

    it('should approve claim manually', () => {
      contract.submitClaim(
        policyHolder,
        1,
        1,
        5000,
        contract.currentBlockHeight,
        'M25',
        'Joint disorder treatment'
      )

      const result = contract.approveClaim(contractOwner, 1, 3000)
      expect(result.type).toBe('ok')
      expect(result.value).toBe(2500) // 3000 - 500 deductible
      
      const claim = contract.getClaim(1)
      expect(claim.claimStatus).toBe('approved')
    })

    it('should reject claim with reason', () => {
      contract.submitClaim(
        policyHolder,
        1,
        1,
        5000,
        contract.currentBlockHeight,
        'M25',
        'Joint disorder treatment'
      )

      const result = contract.rejectClaim(contractOwner, 1, 'Insufficient documentation')
      expect(result.type).toBe('ok')
      
      const claim = contract.getClaim(1)
      expect(claim.claimStatus).toBe('rejected')
      expect(claim.rejectionReason).toBe('Insufficient documentation')
    })

    it('should fail to approve already processed claim', () => {
      contract.submitClaim(
        policyHolder,
        1,
        1,
        1000,
        contract.currentBlockHeight,
        'Z00',
        'General medical examination'
      )

      // Try to approve already approved claim
      const result = contract.approveClaim(contractOwner, 1, 1000)
      expect(result.type).toBe('error')
      expect(result.value).toBe(104) // err-already-processed
    })

    it('should fail claim approval with insufficient funds', () => {
      contract.submitClaim(
        policyHolder,
        1,
        1,
        6000,
        contract.currentBlockHeight,
        'M25',
        'Joint disorder treatment'
      )

      const result = contract.approveClaim(contractOwner, 1, 6000)
      expect(result.type).toBe('error')
      expect(result.value).toBe(105) // err-insufficient-funds
    })

    it('should handle emergency claim override', () => {
      contract.submitClaim(
        policyHolder,
        1,
        1,
        1000,
        contract.currentBlockHeight,
        'Z00',
        'Emergency treatment'
      )

      const result = contract.emergencyClaimOverride(contractOwner, 1, 2000)
      expect(result.type).toBe('ok')
      expect(result.value).toBe(2000)
      
      const claim = contract.getClaim(1)
      expect(claim.claimStatus).toBe('emergency-approved')
    })
  })

  describe('Statistics and Reporting', () => {
    beforeEach(() => {
      contract.createPolicy(contractOwner, policyHolder, 1000, 50000, 500, 1000)
      contract.payPremium(policyHolder, 1, 5000)
      contract.registerProvider(contractOwner, provider, 'Test Hospital', 'LIC123456', 'General Medicine')
    })

    it('should track contract statistics', () => {
      contract.submitClaim(
        policyHolder,
        1,
        1,
        1000,
        contract.currentBlockHeight,
        'Z00',
        'General medical examination'
      )

      const stats = contract.getContractStats()
      expect(stats.totalPolicies).toBe(1)
      expect(stats.totalProviders).toBe(1)
      expect(stats.totalClaims).toBe(1)
      expect(stats.totalClaimsPaid).toBe(1)
      expect(stats.totalClaimsAmount).toBe(500) // After deductible
    })

    it('should return correct policy balance', () => {
      const balance = contract.getPolicyBalance(policyHolder)
      expect(balance.balance).toBe(5000)
    })
  })

  describe('Error Handling', () => {
    it('should handle non-existent policy lookup', () => {
      const policy = contract.getPolicy(999)
      expect(policy).toBeNull()
    })

    it('should handle non-existent provider lookup', () => {
      const provider = contract.getProvider(999)
      expect(provider).toBeNull()
    })

    it('should handle non-existent claim lookup', () => {
      const claim = contract.getClaim(999)
      expect(claim).toBeNull()
    })

    it('should handle non-existent balance lookup', () => {
      const balance = contract.getPolicyBalance('ST999999999999999999999999999999999999999')
      expect(balance).toBeNull()
    })
  })

  describe('Access Control', () => {
    it('should prevent unauthorized claim approval', () => {
      contract.createPolicy(contractOwner, policyHolder, 1000, 50000, 500, 1000)
      contract.payPremium(policyHolder, 1, 5000)
      contract.registerProvider(contractOwner, provider, 'Test Hospital', 'LIC123456', 'General Medicine')
      
      contract.submitClaim(
        policyHolder,
        1,
        1,
        1000,
        contract.currentBlockHeight,
        'M25',
        'Joint disorder treatment'
      )

      const result = contract.approveClaim(unauthorizedUser, 1, 1000)
      expect(result.type).toBe('error')
      expect(result.value).toBe(100) // err-owner-only
    })

    it('should prevent unauthorized claim rejection', () => {
      contract.createPolicy(contractOwner, policyHolder, 1000, 50000, 500, 1000)
      contract.payPremium(policyHolder, 1, 5000)
      contract.registerProvider(contractOwner, provider, 'Test Hospital', 'LIC123456', 'General Medicine')
      
      contract.submitClaim(
        policyHolder,
        1,
        1,
        1000,
        contract.currentBlockHeight,
        'M25',
        'Joint disorder treatment'
      )

      const result = contract.rejectClaim(unauthorizedUser, 1, 'Unauthorized rejection')
      expect(result.type).toBe('error')
      expect(result.value).toBe(100) // err-owner-only
    })
  })
})