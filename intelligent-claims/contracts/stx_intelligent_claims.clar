;; Health Insurance Claims Automation Smart Contract
;; Streamlines claims processing with smart contracts for faster, transparent settlements

;; Constants
(define-constant contract-owner tx-sender)
(define-constant err-owner-only (err u100))
(define-constant err-not-found (err u101))
(define-constant err-unauthorized (err u102))
(define-constant err-invalid-amount (err u103))
(define-constant err-already-processed (err u104))
(define-constant err-insufficient-funds (err u105))
(define-constant err-invalid-status (err u106))
(define-constant err-expired-policy (err u107))
(define-constant err-invalid-provider (err u108))

;; Data Variables
(define-data-var claim-counter uint u0)
(define-data-var policy-counter uint u0)
(define-data-var provider-counter uint u0)
(define-data-var total-claims-paid uint u0)
(define-data-var total-claims-amount uint u0)

;; Insurance Policy Structure
(define-map insurance-policies
  { policy-id: uint }
  {
    policy-holder: principal,
    premium-amount: uint,
    coverage-limit: uint,
    deductible: uint,
    expiry-date: uint,
    active: bool,
    claims-used: uint
  }
)

;; Healthcare Provider Structure
(define-map healthcare-providers
  { provider-id: uint }
  {
    provider-address: principal,
    provider-name: (string-ascii 100),
    license-number: (string-ascii 50),
    specialization: (string-ascii 100),
    verified: bool,
    registration-date: uint
  }
)

;; Claims Structure
(define-map insurance-claims
  { claim-id: uint }
  {
    policy-id: uint,
    claimant: principal,
    provider-id: uint,
    claim-amount: uint,
    treatment-date: uint,
    diagnosis-code: (string-ascii 20),
    treatment-description: (string-utf8 500),
    claim-status: (string-ascii 20),
    submitted-date: uint,
    processed-date: (optional uint),
    approved-amount: uint,
    rejection-reason: (optional (string-utf8 200))
  }
)

;; Policy Holder Balances (for premium payments and claim settlements)
(define-map policy-balances
  { policy-holder: principal }
  { balance: uint }
)

;; Pre-authorized Treatment Codes
(define-map authorized-treatments
  { treatment-code: (string-ascii 20) }
  {
    treatment-name: (string-ascii 100),
    max-coverage: uint,
    requires-preauth: bool
  }
)

;; Policy Management Functions
(define-public (create-policy (policy-holder principal) (premium-amount uint) (coverage-limit uint) (deductible uint) (duration-blocks uint))
  (let ((policy-id (+ (var-get policy-counter) u1)))
    (asserts! (is-eq tx-sender contract-owner) err-owner-only)
    (asserts! (> premium-amount u0) err-invalid-amount)
    (asserts! (> coverage-limit u0) err-invalid-amount)
    
    ;; Create new policy
    (map-set insurance-policies
      { policy-id: policy-id }
      {
        policy-holder: policy-holder,
        premium-amount: premium-amount,
        coverage-limit: coverage-limit,
        deductible: deductible,
        expiry-date: (+ stacks-block-height duration-blocks),
        active: true,
        claims-used: u0
      }
    )
    
    ;; Initialize policy holder balance
    (map-set policy-balances
      { policy-holder: policy-holder }
      { balance: u0 }
    )
    
    ;; Update counter
    (var-set policy-counter policy-id)
    (ok policy-id)
  )
)

(define-public (pay-premium (policy-id uint) (amount uint))
  (let ((policy (unwrap! (map-get? insurance-policies { policy-id: policy-id }) err-not-found)))
    (asserts! (is-eq tx-sender (get policy-holder policy)) err-unauthorized)
    (asserts! (get active policy) err-expired-policy)
    (asserts! (>= amount (get premium-amount policy)) err-invalid-amount)
    
    ;; Update policy holder balance
    (match (map-get? policy-balances { policy-holder: tx-sender })
      current-balance (map-set policy-balances
        { policy-holder: tx-sender }
        { balance: (+ (get balance current-balance) amount) }
      )
      (map-set policy-balances
        { policy-holder: tx-sender }
        { balance: amount }
      )
    )
    (ok true)
  )
)

(define-read-only (get-policy (policy-id uint))
  (map-get? insurance-policies { policy-id: policy-id })
)

;; Healthcare Provider Management
(define-public (register-provider (provider-address principal) (provider-name (string-ascii 100)) (license-number (string-ascii 50)) (specialization (string-ascii 100)))
  (let ((provider-id (+ (var-get provider-counter) u1)))
    (asserts! (is-eq tx-sender contract-owner) err-owner-only)
    
    (map-set healthcare-providers
      { provider-id: provider-id }
      {
        provider-address: provider-address,
        provider-name: provider-name,
        license-number: license-number,
        specialization: specialization,
        verified: true,
        registration-date: stacks-block-height
      }
    )
    
    (var-set provider-counter provider-id)
    (ok provider-id)
  )
)

(define-read-only (get-provider (provider-id uint))
  (map-get? healthcare-providers { provider-id: provider-id })
)

;; Treatment Authorization
(define-public (authorize-treatment (treatment-code (string-ascii 20)) (treatment-name (string-ascii 100)) (max-coverage uint) (requires-preauth bool))
  (begin
    (asserts! (is-eq tx-sender contract-owner) err-owner-only)
    (map-set authorized-treatments
      { treatment-code: treatment-code }
      {
        treatment-name: treatment-name,
        max-coverage: max-coverage,
        requires-preauth: requires-preauth
      }
    )
    (ok true)
  )
)

;; Claims Processing Functions
(define-public (submit-claim (policy-id uint) (provider-id uint) (claim-amount uint) (treatment-date uint) (diagnosis-code (string-ascii 20)) (treatment-description (string-utf8 500)))
  (let (
    (claim-id (+ (var-get claim-counter) u1))
    (policy (unwrap! (map-get? insurance-policies { policy-id: policy-id }) err-not-found))
    (provider (unwrap! (map-get? healthcare-providers { provider-id: provider-id }) err-not-found))
  )
    (asserts! (is-eq tx-sender (get policy-holder policy)) err-unauthorized)
    (asserts! (get active policy) err-expired-policy)
    (asserts! (< stacks-block-height (get expiry-date policy)) err-expired-policy)
    (asserts! (get verified provider) err-invalid-provider)
    (asserts! (> claim-amount u0) err-invalid-amount)
    
    ;; Create claim record
    (map-set insurance-claims
      { claim-id: claim-id }
      {
        policy-id: policy-id,
        claimant: tx-sender,
        provider-id: provider-id,
        claim-amount: claim-amount,
        treatment-date: treatment-date,
        diagnosis-code: diagnosis-code,
        treatment-description: treatment-description,
        claim-status: "submitted",
        submitted-date: stacks-block-height,
        processed-date: none,
        approved-amount: u0,
        rejection-reason: none
      }
    )
    
    ;; Update counter
    (var-set claim-counter claim-id)
    
    ;; Auto-process if conditions are met
    (try! (auto-process-claim claim-id))
    (ok claim-id)
  )
)

(define-private (auto-process-claim (claim-id uint))
  (let (
    (claim (unwrap! (map-get? insurance-claims { claim-id: claim-id }) err-not-found))
    (policy (unwrap! (map-get? insurance-policies { policy-id: (get policy-id claim) }) err-not-found))
    (treatment (map-get? authorized-treatments { treatment-code: (get diagnosis-code claim) }))
  )
    (if (and 
          (is-some treatment)
          (not (get requires-preauth (unwrap-panic treatment)))
          (<= (get claim-amount claim) (get max-coverage (unwrap-panic treatment)))
          (<= (+ (get claims-used policy) (get claim-amount claim)) (get coverage-limit policy))
        )
      ;; Auto-approve claim
      (begin
        (try! (approve-claim claim-id (get claim-amount claim)))
        (ok true)
      )
      ;; Mark for manual review
      (begin
        (map-set insurance-claims
          { claim-id: claim-id }
          (merge claim { claim-status: "under-review" })
        )
        (ok true)
      )
    )
  )
)

(define-public (approve-claim (claim-id uint) (approved-amount uint))
  (let (
    (claim (unwrap! (map-get? insurance-claims { claim-id: claim-id }) err-not-found))
    (policy (unwrap! (map-get? insurance-policies { policy-id: (get policy-id claim) }) err-not-found))
    (policy-holder-balance (unwrap! (map-get? policy-balances { policy-holder: (get claimant claim) }) err-not-found))
  )
    (asserts! (is-eq tx-sender contract-owner) err-owner-only)
    (asserts! (or (is-eq (get claim-status claim) "submitted") (is-eq (get claim-status claim) "under-review")) err-already-processed)
    (asserts! (<= approved-amount (get claim-amount claim)) err-invalid-amount)
    (asserts! (>= (get balance policy-holder-balance) approved-amount) err-insufficient-funds)
    
    ;; Calculate amount after deductible
    (let ((final-amount (if (> approved-amount (get deductible policy))
                          (- approved-amount (get deductible policy))
                          u0)))
      
      ;; Update claim status
      (map-set insurance-claims
        { claim-id: claim-id }
        (merge claim {
          claim-status: "approved",
          processed-date: (some stacks-block-height),
          approved-amount: final-amount
        })
      )
      
      ;; Update policy claims usage
      (map-set insurance-policies
        { policy-id: (get policy-id claim) }
        (merge policy {
          claims-used: (+ (get claims-used policy) final-amount)
        })
      )
      
      ;; Deduct from policy holder balance
      (map-set policy-balances
        { policy-holder: (get claimant claim) }
        { balance: (- (get balance policy-holder-balance) final-amount) }
      )
      
      ;; Update statistics
      (var-set total-claims-paid (+ (var-get total-claims-paid) u1))
      (var-set total-claims-amount (+ (var-get total-claims-amount) final-amount))
      
      (ok final-amount)
    )
  )
)

(define-public (reject-claim (claim-id uint) (reason (string-utf8 200)))
  (let ((claim (unwrap! (map-get? insurance-claims { claim-id: claim-id }) err-not-found)))
    (asserts! (is-eq tx-sender contract-owner) err-owner-only)
    (asserts! (or (is-eq (get claim-status claim) "submitted") (is-eq (get claim-status claim) "under-review")) err-already-processed)
    
    ;; Update claim status
    (map-set insurance-claims
      { claim-id: claim-id }
      (merge claim {
        claim-status: "rejected",
        processed-date: (some stacks-block-height),
        rejection-reason: (some reason)
      })
    )
    (ok true)
  )
)

(define-read-only (get-claim (claim-id uint))
  (map-get? insurance-claims { claim-id: claim-id })
)

;; Policy Holder Functions
(define-read-only (get-policy-balance (policy-holder principal))
  (map-get? policy-balances { policy-holder: policy-holder })
)

(define-read-only (get-claims-by-policy (policy-id uint))
  (let ((claims-list (list)))
    ;; In a real implementation, this would filter claims by policy-id
    ;; For simplicity, returning the policy-id for now
    (ok policy-id)
  )
)

;; Administrative Functions
(define-public (deactivate-policy (policy-id uint))
  (let ((policy (unwrap! (map-get? insurance-policies { policy-id: policy-id }) err-not-found)))
    (asserts! (is-eq tx-sender contract-owner) err-owner-only)
    
    (map-set insurance-policies
      { policy-id: policy-id }
      (merge policy { active: false })
    )
    (ok true)
  )
)

(define-public (update-provider-verification (provider-id uint) (verified bool))
  (let ((provider (unwrap! (map-get? healthcare-providers { provider-id: provider-id }) err-not-found)))
    (asserts! (is-eq tx-sender contract-owner) err-owner-only)
    
    (map-set healthcare-providers
      { provider-id: provider-id }
      (merge provider { verified: verified })
    )
    (ok true)
  )
)

;; Statistics and Reporting
(define-read-only (get-contract-stats)
  (ok {
    total-policies: (var-get policy-counter),
    total-providers: (var-get provider-counter),
    total-claims: (var-get claim-counter),
    total-claims-paid: (var-get total-claims-paid),
    total-claims-amount: (var-get total-claims-amount)
  })
)

(define-read-only (get-policy-utilization (policy-id uint))
  (match (map-get? insurance-policies { policy-id: policy-id })
    policy (ok {
      coverage-limit: (get coverage-limit policy),
      claims-used: (get claims-used policy),
      utilization-percentage: (* (/ (get claims-used policy) (get coverage-limit policy)) u100)
    })
    err-not-found
  )
)

;; Emergency Functions
(define-public (emergency-claim-override (claim-id uint) (approved-amount uint))
  (let ((claim (unwrap! (map-get? insurance-claims { claim-id: claim-id }) err-not-found)))
    (asserts! (is-eq tx-sender contract-owner) err-owner-only)
    
    ;; Emergency approval without balance checks
    (map-set insurance-claims
      { claim-id: claim-id }
      (merge claim {
        claim-status: "emergency-approved",
        processed-date: (some stacks-block-height),
        approved-amount: approved-amount
      })
    )
    
    ;; Update statistics
    (var-set total-claims-paid (+ (var-get total-claims-paid) u1))
    (var-set total-claims-amount (+ (var-get total-claims-amount) approved-amount))
    
    (ok approved-amount)
  )
)

;; Initialize contract with some default authorized treatments
(map-set authorized-treatments
  { treatment-code: "Z00" }
  {
    treatment-name: "General medical examination",
    max-coverage: u50000,
    requires-preauth: false
  }
)

(map-set authorized-treatments
  { treatment-code: "M25" }
  {
    treatment-name: "Joint disorders",
    max-coverage: u200000,
    requires-preauth: true
  }
)