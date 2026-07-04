/**
 * Professional image "verticals" + human-presence modes.
 *
 * These are composable MODULES layered on top of the general professional base
 * prompt (the editable `image_style:professional` process prompt in
 * master_prompts, which holds the visual style / brand feel / color direction /
 * UI direction / negative prompt — everything that stays constant across every
 * professional image).
 *
 * Final scene sent to the prompt builder =
 *   base process prompt (system)  +  vertical + human presence (user message)
 *
 * Kept in code (not DB) on purpose: they are structural, numerous and best
 * versioned in git. The base prompt covers the "editable/tunable" layer. If
 * per-tenant tuning is ever needed, these can migrate to master_prompts without
 * breaking callers.
 *
 * UI labels are in Spanish; the `direction` texts are in English because they
 * are injected verbatim into the gpt-image-2 prompt builder.
 */

export interface ProfessionalVertical {
  /** Short stable key, e.g. 'import_operations'. */
  key: string;
  /** UI label (Spanish). */
  label: string;
  /** UI helper (Spanish). */
  hint: string;
  /** VERTICAL MODULE — high-level direction (English). */
  direction: string;
  /** SCENE MODULE — concrete scene setup (English). */
  sceneModule: string;
  /** SCREEN CONTENT — what the laptop platform shows (English). */
  screenContent: string;
  /** DOCUMENTS / PROPS — desk documents and props (English). */
  documentsProps: string;
}

export interface HumanPresenceMode {
  /** Short stable key, e.g. 'faceless'. */
  key: string;
  /** UI label (Spanish). */
  label: string;
  /** HUMAN PRESENCE MODE direction (English). */
  direction: string;
}

/** Default presence mode: people without identifiable faces (lowest AI-face risk). */
export const DEFAULT_PRESENCE_MODE_KEY = 'faceless';

export const HUMAN_PRESENCE_MODES: HumanPresenceMode[] = [
  {
    key: 'no_people',
    label: 'Sin personas',
    direction:
      'HUMAN PRESENCE MODE — NO PEOPLE: Do not show any people, faces, hands or body parts. The scene still feels active and business-relevant through environment and objects: an open laptop with the modern Xending-style platform, upright financial documents, import files, Commercial Invoice, Bill of Lading, FX report, payment schedule, premium pen, notebook, corporate folder, port view, containers, warehouse background or treasury office context. It should feel like a real executive workspace moments before or after an important treasury decision. No empty generic desk, no lifeless sterile scene, no random objects. Everything communicates international payments, FX control, supplier financing or import operations.',
  },
  {
    key: 'faceless',
    label: 'Personas sin rostro visible',
    direction:
      'HUMAN PRESENCE MODE — PEOPLE WITHOUT VISIBLE FACES: Show one or two business professionals, but their faces must not be clearly visible. Use natural editorial framing: cropped from shoulders down, back view, side angle with face turned away, over-the-shoulder view, hands reviewing documents, person looking down at the laptop, face partially out of frame, or shallow depth of field that keeps the face non-identifiable. Focus on the laptop screen, documents, hands, business action and corporate environment. People feel real, professional and natural, but anonymous. No clear frontal face, no direct eye contact with camera, no posed smiling, no fake corporate acting, no AI-looking faces.',
  },
  {
    key: 'hands_only',
    label: 'Solo manos / firma / aprobación',
    direction:
      'HUMAN PRESENCE MODE — HANDS ONLY: Show only realistic hands and partial arms interacting with the business materials: signing a financing agreement, pointing at a laptop screen, holding a pen, reviewing a Commercial Invoice, touching a payment approval document, typing on the laptop, organizing import documents, or confirming a supplier payment. Hands must look realistic: natural proportions and skin texture, correct number of fingers, credible position, no distorted or extra fingers, no plastic skin, no overly perfect hands. Do not show full faces. Do not show the person looking at the camera. Focus on the action, the documents and the platform.',
  },
  {
    key: 'natural_faces',
    label: 'Personas con rostro natural',
    direction:
      'HUMAN PRESENCE MODE — REALISTIC PEOPLE WITH NATURAL FACES: Show realistic business professionals with natural, credible faces — real CFOs, treasury managers, business owners, finance analysts or operations directors. Expressions are subtle, calm and focused: not smiling at the camera, not posing, not exaggerated. Candid editorial body language: looking at the laptop, reviewing documents, discussing with another executive, listening, taking notes, pointing naturally at the screen, or making a business decision. Faces show realistic skin texture, natural asymmetry, normal human imperfections, credible age details and natural lighting. Avoid AI-perfect faces, plastic skin, glossy eyes, oversharpened faces, forced smiles, direct camera gaze, fashion-model look, generic stock-photo executives, unnatural teeth, overly symmetrical features or staged people.',
  },
  {
    key: 'over_shoulder',
    label: 'Over-the-shoulder / persona de espalda',
    direction:
      'HUMAN PRESENCE MODE — OVER-THE-SHOULDER VIEW: Use an over-the-shoulder editorial perspective of a business professional reviewing the laptop platform. The person is seen from behind or a side-back angle; the face is not visible or only minimally visible. The laptop screen remains the hero element and must be sharp enough to understand the platform. It feels like a real executive reviewing treasury operations, supplier payments, FX coverage or financing approval. Natural posture, calm business focus, no direct eye contact, no staged pose, no AI-looking face.',
  },
  {
    key: 'partial_body',
    label: 'Cuerpo parcial / torso ejecutivo',
    direction:
      'HUMAN PRESENCE MODE — PARTIAL BODY ONLY: Show only partial body presence: torso, arms, hands, suit jacket, shirt cuffs or seated posture. Do not show a full clear face; the person may be cropped at the neck, shoulder or side profile. Focus on the business action: laptop platform, documents, payment approval, supplier financing, FX coverage report, import file or treasury dashboard. Human presence adds credibility and scale without becoming the main subject.',
  },
  {
    key: 'team',
    label: 'Equipo sin caras protagonistas',
    direction:
      'HUMAN PRESENCE MODE — TEAM WITHOUT FACE FOCUS: Show a small finance or executive team in a meeting, but do not make the faces the main focus. Use natural composition: people slightly turned away, faces partially obscured, soft background focus, hands gesturing, documents on the table, laptop screen in focus, over-the-shoulder composition or side angles. It communicates collaboration, treasury decision-making and institutional control. Avoid frontal group portraits, everyone smiling at the camera, stock-photo boardroom cliché and AI-looking faces.',
  },
];

export const PROFESSIONAL_VERTICALS: ProfessionalVertical[] = [
  {
    key: 'import_operations',
    label: 'Importaciones / Contenedores',
    hint: 'Operación de importación, proveedores internacionales, logística.',
    direction:
      'VERTICAL — IMPORT OPERATIONS / CONTAINERS: Focus on a real import operation involving international suppliers, container logistics, supplier payments and trade documentation. Message: Xending helps import companies pay international suppliers, manage FX exposure and keep global trade operations moving. The scene feels operational, financial and international, not decorative.',
    sceneModule:
      'A business owner, CFO or operations director reviews an import operation from a premium office overlooking a port, container yard or logistics area. In the background, containers, cranes, trucks, ships or logistics infrastructure, slightly out of focus and realistic. The person reviews supplier payment documents on a clean executive desk while a laptop displays the Xending-style platform. Mood: control, speed, trust and international execution.',
    screenContent:
      'A modern international supplier payment workflow. Visible UI: supplier payment card, payment amount, currency selector, beneficiary verification, payment route, payment timeline, approval status. Clean labels such as "Supplier payment", "USD payment", "MXN funding", "Beneficiary verified", "Payment scheduled" or "Approved". It communicates the company is ready to pay an international supplier in a controlled, traceable way.',
    documentsProps:
      'Realistic generic import documents: Commercial Invoice, Bill of Lading, Packing List, Payment Instruction, Supplier Invoice. Upright, clean, professional and naturally arranged.',
  },
  {
    key: 'fx_coverage',
    label: 'Coberturas cambiarias / FX',
    hint: 'Gestión de riesgo cambiario, margen protegido, decisión de tesorería.',
    direction:
      'VERTICAL — FX COVERAGE / MARGIN PROTECTION: Focus on corporate FX risk management, USD/MXN exposure, margin protection and treasury decision-making. Message: Xending helps companies protect their margin before paying international invoices. It feels like corporate treasury strategy, not trading, speculation or financial gambling.',
    sceneModule:
      'Two executives — a CFO and a treasury manager — sit in a bright premium meeting room discussing FX exposure and margin protection, reviewing a laptop and printed FX scenario reports. One may point naturally at the laptop screen while the other reviews documents. Mood: strategic, calm, institutional, high-trust. No trading floor, no Wall Street chaos, no speculative energy.',
    screenContent:
      'A modern FX coverage dashboard. Visible UI: main card labeled "FX Coverage", USD/MXN exposure summary, protected amount card, forward/target rate card, maturity date timeline, a small elegant exchange-rate chart, and a clean status label such as "Coverage active", "Margin protected" or "FX risk controlled". It communicates the company controlled its FX exposure before paying international suppliers.',
    documentsProps:
      'Realistic generic treasury documents: FX Scenario Report, Payment Schedule, Supplier Invoice, Treasury Approval Memo. Premium, upright, clean and credible.',
  },
  {
    key: 'supplier_financing',
    label: 'Financiamiento a proveedor',
    hint: 'Capital de trabajo, financiamiento de pago a proveedor, aprobación.',
    direction:
      'VERTICAL — SUPPLIER FINANCING / WORKING CAPITAL: Focus on supplier payment financing, working capital support, import financing and payment approval. Message: Xending helps companies finance supplier payments so they can keep importing without pressuring cash flow. Calm, controlled and financially strategic.',
    sceneModule:
      'A serious CFO or business owner sits at a premium executive desk reviewing a supplier financing approval for an import operation, calm and focused, reviewing documents and the laptop. The scene clearly communicates that financing has been approved so the company can pay an international supplier on time. Environment: corporate office, port-view office or clean finance workspace.',
    screenContent:
      'A clean supplier payment financing approval view. Visible UI: main status card labeled "Approved", financing amount card, supplier payment flow, payment timeline, due date indicator, approval summary, funding status. Clean labels such as "Supplier payment financing", "Funding approved", "Payment scheduled", "International supplier" and "USD/MXN". It communicates funding is approved and the supplier payment is ready.',
    documentsProps:
      'Realistic generic financing and import documents: Commercial Invoice, Bill of Lading, Packing List, Financing Agreement, Payment Schedule. Upright, clean, premium and professionally arranged.',
  },
  {
    key: 'international_payments',
    label: 'Pagos internacionales / Tesorería',
    hint: 'Tesorería centralizada, multi-divisa, aprobaciones de pago.',
    direction:
      'VERTICAL — INTERNATIONAL PAYMENTS / CENTRALIZED TREASURY: Focus on centralized treasury operations, international payments, multi-currency balances, payment approvals and corporate control. Message: Xending centralizes payments, FX and treasury operations for companies operating internationally. Organized, executive and operationally efficient.',
    sceneModule:
      'A finance team reviews a centralized treasury dashboard in a premium boardroom or executive office. One person points naturally at the laptop screen while others review documents or take notes. It communicates control, order, governance, visibility and professional execution across companies, payments and currencies.',
    screenContent:
      'A premium corporate treasury dashboard. Visible UI: multi-currency balances, recent payments, quick FX quote card, payment approvals, cash position summary, market overview, small clean charts, payment pipeline. Currencies such as USD, MXN, EUR and CAD. It feels like a central command center for corporate payments, FX and treasury operations.',
    documentsProps:
      'Realistic generic treasury documents: Payment Schedule, Treasury Approval Memo, Supplier Invoice, Cash Flow Projection, International Payment Summary. Clean, upright and professionally arranged.',
  },
  {
    key: 'compliance',
    label: 'Compliance / Beneficiarios',
    hint: 'Verificación de beneficiarios, trazabilidad, control de riesgo.',
    direction:
      'VERTICAL — COMPLIANCE / BENEFICIARY VERIFICATION: Focus on beneficiary verification, payment traceability, risk control, approval governance and secure international payments. Message: Xending gives companies more control, verification and traceability before sending money internationally. Secure, institutional and procedural, not bureaucratic or intimidating.',
    sceneModule:
      'A treasury analyst, CFO or compliance-oriented finance professional reviews beneficiary details before sending an international payment, in a clean premium office with a laptop, payment instruction documents and supplier files. The person looks calm, focused and precise. Mood: security, verification, control and institutional process.',
    screenContent:
      'A modern beneficiary verification and payment approval module. Visible UI: beneficiary verification status, supplier details, payment route, currency, country, approval workflow, risk check, payment status. Clean labels such as "Beneficiary verified", "Payment approved", "Treasury review", "Secure payment route" or "Ready to send". It communicates traceability, governance and confidence before payment execution.',
    documentsProps:
      'Realistic generic documents: Beneficiary Details, Payment Instruction, Supplier Invoice, Treasury Approval Memo, Compliance Checklist. Upright, clean and professional. No excessive legal text, no real names or logos.',
  },
  {
    key: 'industrial',
    label: 'Industria / Maquinaria',
    hint: 'Importación de maquinaria, equipo y materia prima; operación real.',
    direction:
      'VERTICAL — INDUSTRIAL IMPORT FINANCE: Focus on real companies importing machinery, industrial equipment, parts, raw materials or operational supplies. Message: Xending connects real industrial operations with financial execution — supplier payments, FX control and financing. Practical, premium and operational.',
    sceneModule:
      'A business owner, operations director or finance manager reviews financing and international payment details on a laptop inside a clean modern industrial facility or warehouse. Background: machinery, equipment crates, pallets, packaged industrial parts or clean logistics activity — realistic, premium and controlled, not dirty or chaotic. The person looks competent, calm and operationally experienced.',
    screenContent:
      'Supplier financing or payment workflow for imported equipment. Visible UI: imported equipment invoice, financing amount, invoice amount, due date, payment timeline, supplier payment status, approval status, currency selector. Clean labels such as "Equipment supplier", "Financing approved", "Payment scheduled", "USD payment" or "Treasury approved". It connects the industrial operation with financial control.',
    documentsProps:
      'Realistic generic documents nearby: Equipment Invoice, Packing List, Import File, Payment Schedule, Financing Agreement. Clean, upright, professional and not overloaded with text.',
  },
  {
    key: 'payment_authorization',
    label: 'Firma / Autorización',
    hint: 'Momento de aprobación, firma, cierre de operación.',
    direction:
      'VERTICAL — PAYMENT AUTHORIZATION / EXECUTIVE APPROVAL: Focus on the moment of approval — signing, authorizing, confirming or closing a supplier payment or financing decision. Message: Xending supports controlled treasury decisions with clear approval, documentation and execution. Serious, professional and decisive.',
    sceneModule:
      'A corporate treasurer, CFO or business owner signs a payment authorization or financing agreement at a premium executive desk. A laptop beside the document shows the approved workflow. Focus on the natural signing moment, upright documents and the modern platform screen. Controlled, institutional and credible.',
    screenContent:
      'A payment approval workflow. Visible UI: main status labeled "Approved", payment amount, supplier payment, authorized users, approval timeline, treasury confirmation, payment scheduled status. Clean labels such as "Payment approved", "Treasury approved", "Supplier payment", "Authorization complete" or "Funding approved". It communicates the transaction is authorized and ready for execution.',
    documentsProps:
      'Realistic generic documents: Payment Authorization, Financing Agreement, Supplier Invoice, Payment Schedule, Treasury Approval Memo. Upright, clean and naturally arranged. A premium pen is visible during the signing moment.',
  },
  {
    key: 'boardroom',
    label: 'Boardroom / Decisión estratégica',
    hint: 'Decisión senior de tesorería, FX y operaciones globales.',
    direction:
      'VERTICAL — EXECUTIVE TREASURY STRATEGY: Focus on senior-level decision-making around treasury, FX, financing, supplier payments and international operations. Message: Xending is an executive-grade financial infrastructure platform for companies operating globally. Strategic, senior, institutional and premium.',
    sceneModule:
      'A group of executives sit in a premium boardroom discussing treasury strategy, FX risk and international payment operations. The laptop is on the table and clearly displays the Xending-style platform. People look engaged and focused, not staged or overly cheerful. It communicates trust, governance and high-level financial decision-making.',
    screenContent:
      'An executive treasury overview. Visible UI: FX exposure, payment pipeline, approved financing, multi-currency balances, upcoming supplier payments, cash position, risk summary, approval status. Clean labels such as "Treasury overview", "FX exposure", "Payment pipeline", "Approved financing" and "Upcoming payments". It feels like a premium command center for CFOs.',
    documentsProps:
      'Realistic generic documents on the boardroom table: Treasury Strategy Memo, FX Scenario Report, Payment Pipeline, Supplier Financing Summary, Cash Flow Projection. Clean, upright and premium.',
  },
];

/** Look up a vertical by key. */
export function getProfessionalVertical(key: string): ProfessionalVertical | undefined {
  return PROFESSIONAL_VERTICALS.find((v) => v.key === key);
}

/** Look up a human-presence mode by key. */
export function getHumanPresenceMode(key: string): HumanPresenceMode | undefined {
  return HUMAN_PRESENCE_MODES.find((m) => m.key === key);
}

/**
 * Compose the vertical + presence context injected into the scene (as the user
 * message) before the base process prompt builds the final gpt-image-2 prompt.
 * Returns '' when no vertical is selected.
 */
export function composeVerticalContext(
  verticalKey: string | null | undefined,
  presenceKey: string | null | undefined,
): string {
  const vertical = verticalKey ? getProfessionalVertical(verticalKey) : undefined;
  if (!vertical) return '';

  const presence =
    getHumanPresenceMode(presenceKey ?? DEFAULT_PRESENCE_MODE_KEY) ??
    getHumanPresenceMode(DEFAULT_PRESENCE_MODE_KEY)!;

  return [
    vertical.direction,
    `SCENE MODULE: ${vertical.sceneModule}`,
    presence.direction,
    `SCREEN CONTENT: ${vertical.screenContent}`,
    `DOCUMENTS / PROPS: ${vertical.documentsProps}`,
  ].join('\n\n');
}
