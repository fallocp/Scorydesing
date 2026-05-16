# Master Prompts Architecture

## Overview

4 master prompts that power the Xending Design Generator campaign system.
Each prompt consumes dynamic variables from the campaign architecture (brand, branch, vertical, moment, channel, angle, etc.).

## Prompts

| Prompt | Purpose | When Called |
|--------|---------|------------|
| masterContentPrompt | Generates copy pieces with structured JSON | When user clicks "Generar Ideas" |
| masterImagePrompt | Converts copy into professional image prompts | After copy is approved, for each piece |
| masterVariantPrompt | Generates variants without changing strategy | When user requests copy variations |
| masterClaimValidationPrompt | Validates compliance before saving | Before saving/publishing any piece |

## Flow

1. User selects: Brand + Branch + Vertical + Channel + Angle + Quantity
2. System calls: masterContentPrompt → receives JSON with pieces
3. Per piece: masterImagePrompt → receives visual prompt
4. Before save: masterClaimValidationPrompt → validates
5. For variants: masterVariantPrompt → generates alternatives

## Variables

All prompts consume these dynamic variables from the campaign architecture:
- brand, productLine, campaignCategory, commercialBranch
- branchObjective, mainInsight, businessPain, promise
- industryVertical, marketMoment, audience, angle
- channel, format, quantity
- proofPoints, avoidClaims, tone
- defaultCTAs, footerSuggestions, visualGuidelines
- brandColors, visualRestrictions

## Integration Status

- [ ] masterContentPrompt → integrate into `generate-ideas` edge function
- [ ] masterImagePrompt → integrate into image prompt generation in CopyWorkstation
- [ ] masterVariantPrompt → integrate into "Generar variantes de copy" flow
- [ ] masterClaimValidationPrompt → add as validation layer before save
