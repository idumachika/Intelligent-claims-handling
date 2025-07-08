# Health Insurance Claims Automation Smart Contract

A comprehensive Clarity smart contract for automating health insurance claims processing on the Stacks blockchain. This contract streamlines the entire insurance workflow from policy creation to claims settlement with transparent, automated processing.

## Overview

This smart contract provides a complete health insurance management system that includes:
- Insurance policy management
- Healthcare provider registration and verification
- Automated claims processing with pre-authorization
- Premium payment handling
- Treatment authorization management
- Comprehensive reporting and statistics

## Features

### 🏥 Policy Management
- Create and manage insurance policies with customizable coverage limits
- Premium payment processing with balance tracking
- Policy activation/deactivation controls
- Expiry date management

### 👩‍⚕️ Healthcare Provider Network
- Provider registration with verification system
- License number and specialization tracking
- Provider verification status management

### 📋 Claims Processing
- Automated claim submission and processing
- Smart approval system based on pre-authorized treatments
- Manual review workflow for complex claims
- Deductible calculations and coverage limit enforcement

### 💰 Financial Management
- Policy holder balance tracking
- Premium payment processing
- Claim settlement automation
- Comprehensive financial reporting

## Contract Structure

### Key Data Maps

#### Insurance Policies
```clarity
insurance-policies: {
  policy-id: uint,
  policy-holder: principal,
  premium-amount: uint,
  coverage-limit: uint,
  deductible: uint,
  expiry-date: uint,
  active: bool,
  claims-used: uint
}
```

#### Healthcare Providers
```clarity
healthcare-providers: {
  provider-id: uint,
  provider-address: principal,
  provider-name: string,
  license-number: string,
  specialization: string,
  verified: bool,
  registration-date: uint
}
```

#### Insurance Claims
```clarity
insurance-claims: {
  claim-id: uint,
  policy-id: uint,
  claimant: principal,
  provider-id: uint,
  claim-amount: uint,
  treatment-date: uint,
  diagnosis-code: string,
  treatment-description: string,
  claim-status: string,
  submitted-date: uint,
  processed-date: optional uint,
  approved-amount: uint,
  rejection-reason: optional string
}
```

## Core Functions

### Policy Management

#### `create-policy`
Creates a new insurance policy (owner only).
```clarity
(create-policy policy-holder premium-amount coverage-limit deductible duration-blocks)
```

#### `pay-premium`
Allows policy holders to pay premiums.
```clarity
(pay-premium policy-id amount)
```

#### `get-policy`
Retrieves policy information.
```clarity
(get-policy policy-id)
```

### Provider Management

#### `register-provider`
Registers a new healthcare provider (owner only).
```clarity
(register-provider provider-address provider-name license-number specialization)
```

#### `update-provider-verification`
Updates provider verification status (owner only).
```clarity
(update-provider-verification provider-id verified)
```

### Claims Processing

#### `submit-claim`
Submits a new insurance claim.
```clarity
(submit-claim policy-id provider-id claim-amount treatment-date diagnosis-code treatment-description)
```

#### `approve-claim`
Approves a claim for payment (owner only).
```clarity
(approve-claim claim-id approved-amount)
```

#### `reject-claim`
Rejects a claim with reason (owner only).
```clarity
(reject-claim claim-id reason)
```

### Treatment Authorization

#### `authorize-treatment`
Authorizes treatment codes for automatic processing (owner only).
```clarity
(authorize-treatment treatment-code treatment-name max-coverage requires-preauth)
```

## Automated Processing

The contract includes intelligent automated claim processing:

1. **Auto-approval conditions:**
   - Treatment code is pre-authorized
   - No pre-authorization required
   - Claim amount within treatment coverage limit
   - Policy has sufficient remaining coverage

2. **Manual review triggers:**
   - Unrecognized treatment codes
   - Claims exceeding treatment limits
   - Pre-authorization required treatments
   - Insufficient policy coverage

## Error Codes

| Code | Error | Description |
|------|-------|-------------|
| u100 | `err-owner-only` | Function restricted to contract owner |
| u101 | `err-not-found` | Requested resource not found |
| u102 | `err-unauthorized` | Unauthorized access attempt |
| u103 | `err-invalid-amount` | Invalid amount provided |
| u104 | `err-already-processed` | Claim already processed |
| u105 | `err-insufficient-funds` | Insufficient funds for operation |
| u106 | `err-invalid-status` | Invalid status for operation |
| u107 | `err-expired-policy` | Policy has expired |
| u108 | `err-invalid-provider` | Provider not verified or invalid |

## Pre-configured Treatments

The contract comes with two pre-configured treatment codes:

- **Z00**: General medical examination (max: 50,000 units, no pre-auth)
- **M25**: Joint disorders (max: 200,000 units, requires pre-auth)

## Usage Examples

### Creating a Policy
```clarity
;; Create a policy with 1M coverage, 10K deductible, valid for 52,560 blocks (~1 year)
(contract-call? .health-insurance create-policy 'SP1...HOLDER u100000 u1000000 u10000 u52560)
```

### Submitting a Claim
```clarity
;; Submit a claim for general examination
(contract-call? .health-insurance submit-claim u1 u1 u45000 u1000 "Z00" u"Routine checkup")
```

### Paying Premium
```clarity
;; Pay premium for policy
(contract-call? .health-insurance pay-premium u1 u100000)
```

## Security Features

- **Owner-only functions**: Critical administrative functions restricted to contract owner
- **Policy validation**: Comprehensive checks for policy validity and expiry
- **Provider verification**: Only verified providers can receive claim payments
- **Balance management**: Automatic balance tracking and insufficient funds protection
- **Claim status tracking**: Prevents double processing of claims

## Statistics and Reporting

The contract provides comprehensive statistics:
- Total policies created
- Total registered providers
- Total claims processed
- Total claims paid
- Total claim amounts
- Policy utilization rates

## Emergency Features

### Emergency Claim Override
For critical situations, the contract owner can override normal processing:
```clarity
(emergency-claim-override claim-id approved-amount)
```

## Deployment Considerations

1. **Gas Costs**: Functions with complex logic may require higher gas limits
2. **Upgradability**: Contract is immutable once deployed
3. **Admin Keys**: Secure management of contract owner keys is critical
4. **Provider Onboarding**: Establish verification process for healthcare providers
5. **Treatment Codes**: Maintain updated list of authorized treatments

## Testing Recommendations

1. Test policy creation and premium payments
2. Verify provider registration and verification workflows
3. Test automated claim processing with various scenarios
4. Validate manual review and approval processes
5. Test emergency override functionality
6. Verify error handling for all edge cases

## License

This smart contract is provided as-is for educational and development purposes. Ensure proper testing and security audits before production deployment.

## Contributing

To contribute to this contract:
1. Test thoroughly on testnet
2. Follow Clarity best practices
3. Document any new features
4. Ensure backward compatibility where possible

---

*This contract demonstrates advanced Clarity programming concepts including complex data structures, automated processing logic, and comprehensive error handling suitable for production healthcare applications.*