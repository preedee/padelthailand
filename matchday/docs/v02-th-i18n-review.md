# Matchday v0.2.0 — Native-Thai i18n review checklist

> **Status:** READY FOR REVIEW (2026-04-27).
> **Source:** `matchday-web/messages/{en,th}.json` (both 80+ keys).
> **Reviewer needed:** native Thai speaker, ideally with some sports / padel context.
> **Carried from:** v0.1.0 deferral; reaffirmed in `Plans/v02-build-plan.md` v2 §1.

Every Thai string was AI-generated. None has been reviewed by a native
speaker. This document organizes them into priority buckets so review
can be done in one focused pass — start with **Bucket A** (legal/PDPA
risk) and work down. Most of Bucket D you can skim.

---

## How to use this checklist

For each string:

| Column | What it means |
|---|---|
| **Key** | Path inside the JSON bundle (e.g. `sign_in.card_title`) |
| **EN** | English source-of-truth |
| **TH (current)** | The AI-generated Thai we're shipping until you say otherwise |
| **Verdict** | Mark with ✓ (acceptable as-is) / ✗ (needs rewrite — propose new wording) / ? (deferred / unsure) |
| **Notes** | Reviewer comments — natural alternative, register issues, etc. |

**What to flag (✗ verdict):**
- Wrong meaning, mistranslation
- Wrong register (overly formal / too casual for context)
- Awkward phrasing a native speaker wouldn't write
- Legal/PDPA precision issues
- Padel-specific vocabulary that's wrong or unfamiliar

**What NOT to flag:**
- Stylistic preference (multiple acceptable phrasings — only flag if current is genuinely wrong)
- Length differences (Thai often longer/shorter than English; UI is flexible)
- Words intentionally kept in English (Bucket D)

---

## Bucket A — Legal / PDPA-sensitive (HIGHEST priority)

These touch consent, age requirements, or privacy commitments. Wrong
wording risks compliance issues.

| Key | EN | TH (current) | Verdict | Notes |
|---|---|---|---|---|
| `sign_in.min_age_notice` | You must be 13 or older to use Matchday. | คุณต้องมีอายุ 13 ปีขึ้นไปจึงจะใช้ Matchday ได้ |   |   |
| `onboard.error_dob_min_age` | You must be at least 13 years old to use Matchday. | คุณต้องมีอายุอย่างน้อย 13 ปีจึงจะใช้ Matchday ได้ |   |   |
| `onboard.consent_label` | I agree to the &lt;privacy&gt;privacy policy&lt;/privacy&gt; and &lt;terms&gt;terms of service&lt;/terms&gt;. | ฉันยอมรับ&lt;privacy&gt;นโยบายความเป็นส่วนตัว&lt;/privacy&gt;และ&lt;terms&gt;ข้อกำหนดการให้บริการ&lt;/terms&gt; |   | Updated 2026-04-27 — bundles both consents into one click. `<privacy>` + `<terms>` tags rendered by next-intl `t.rich` as separate links to `/privacy` and `/terms`. |
| `onboard.consent_required` | Please accept the privacy policy and terms of service to continue. | กรุณายอมรับนโยบายความเป็นส่วนตัวและข้อกำหนดการให้บริการเพื่อดำเนินการต่อ |   | Plain text — error message shown below the checkbox if user submits without ticking |
| `onboard.consent_required` | Please accept the privacy policy to continue. | กรุณายอมรับนโยบายความเป็นส่วนตัวเพื่อดำเนินการต่อ |   |   |
| `onboard.field_dob_help` | Used internally for age categories. Never displayed on profiles. | ใช้ภายในเพื่อจัดกลุ่มอายุ ไม่แสดงบนโปรไฟล์ |   |   |
| `onboard.field_country` | Country of residence | ประเทศที่อยู่อาศัย |   |   |
| `onboard.field_nationality` | Nationality | สัญชาติ |   |   |

**PDPA note:** Thai PDPA (Personal Data Protection Act) has specific
language requirements for consent collection. The current
`consent_label` is short — confirm whether explicit reference to
specific data categories (DOB, nationality, contact info) is required.

---

## Bucket B — Padel-specific vocabulary (HIGH priority)

These need someone who knows how Thai padel community talks. The
question for each: does the term match what players actually say in
Thai-language padel contexts (Bangkok / TPS / TPA clubs)?

| Key | EN | TH (current) | Verdict | Notes |
|---|---|---|---|---|
| `landing.value_prop_1_title` | Run padel tournaments with live scoring | จัดการแข่งขันพาเดลพร้อมระบบให้คะแนนสด |   |   |
| `landing.value_prop_1_body` | Enter scores set-by-set. The bracket updates as the tournament unfolds. | กรอกคะแนนทีละเซ็ต สายการแข่งขันจะอัปเดตทันทีตามการแข่งขัน |   |   |
| `landing.value_prop_2_title` | Players see brackets update in realtime | ผู้เล่นเห็นสายการแข่งขันอัปเดตแบบเรียลไทม์ |   |   |
| `landing.value_prop_3_body` | Solo and doubles registration, draw generation, scoring, scheduling, placements. | ลงทะเบียนเดี่ยวและคู่ จัดสาย กรอกคะแนน จัดตารางแข่ง สรุปอันดับ |   |   |
| `onboard.field_playing_hand` | Playing hand | มือที่ถนัด |   |   |
| `onboard.field_playing_hand_right` | Right | ขวา |   |   |
| `onboard.field_playing_hand_left` | Left | ซ้าย |   |   |
| `onboard.field_playing_hand_ambidextrous` | Ambidextrous | สองมือ |   |   |
| `onboard.field_preferred_side` | Preferred side | ฝั่งที่ถนัด |   |   |
| `onboard.field_preferred_side_drive` | Drive (right) | Drive (ขวา) |   | Padel term: keep "Drive" English or transliterate to "ดรายฟ์"? |
| `onboard.field_preferred_side_reverse` | Reverse (left) | Reverse (ซ้าย) |   | Same question for "Reverse" |
| `onboard.field_preferred_side_both` | Both | ทั้งสองฝั่ง |   |   |

**Sport-vocabulary judgment calls:** "bracket" → `สายการแข่งขัน` is
literal; "draw" → `จัดสาย`; "set" → `เซ็ต` (transliteration). These are
likely accepted but worth confirming against actual Bangkok padel
language usage (TPS WhatsApp groups, TPA flyers, etc.).

---

## Bucket C — General copy (MEDIUM priority)

The bulk of the bundle. Mostly UI labels, buttons, error messages, page
descriptions. Likely AI-translation tells: literal renderings,
preposition choices, formal-vs-casual register slips.

### Sign-in flow

| Key | EN | TH (current) | Verdict | Notes |
|---|---|---|---|---|
| `sign_in.card_title` | Sign in to Matchday | เข้าสู่ระบบ Matchday |   |   |
| `sign_in.card_description` | Continue with one of the options below. | เลือกวิธีเข้าสู่ระบบด้านล่าง |   |   |
| `sign_in.continue_with_google` | Continue with Google | ดำเนินการต่อด้วย Google |   |   |
| `sign_in.continue_with_facebook` | Continue with Facebook | ดำเนินการต่อด้วย Facebook |   |   |
| `sign_in.continue_with_apple` | Continue with Apple | ดำเนินการต่อด้วย Apple |   |   |
| `sign_in.divider_or` | or | หรือ |   |   |
| `sign_in.magic_link_heading` | Sign in with email | เข้าสู่ระบบด้วยอีเมล |   |   |
| `sign_in.send_magic_link` | Send magic link | ส่งลิงก์เข้าสู่ระบบ |   | "magic link" → "ลิงก์มหัศจรรย์" too literal; "ลิงก์เข้าสู่ระบบ" simpler. Confirm. |
| `sign_in.sending` | Sending… | กำลังส่ง… |   |   |
| `sign_in.magic_link_sent_title` | Check your email | ตรวจสอบอีเมลของคุณ |   |   |
| `sign_in.magic_link_sent_body` | A magic link is on its way to {email}. Click it to sign in. | เราส่งลิงก์เข้าสู่ระบบไปยัง {email} แล้ว คลิกที่ลิงก์เพื่อเข้าสู่ระบบ |   |   |
| `sign_in.error_oauth` | Sign-in was cancelled. Try again. | การเข้าสู่ระบบถูกยกเลิก กรุณาลองใหม่ |   |   |
| `sign_in.error_generic` | Something went wrong. Please try again. | เกิดข้อผิดพลาด กรุณาลองใหม่ |   |   |
| `sign_in.aria_label_continue_with` | Continue with {provider} | ดำเนินการต่อด้วย {provider} |   |   |

### Onboard flow (form labels)

| Key | EN | TH (current) | Verdict | Notes |
|---|---|---|---|---|
| `onboard.page_title` | Tell us about yourself | บอกเราเกี่ยวกับคุณ |   |   |
| `onboard.page_description` | Just a few details so we can set up your profile. You can edit any of this later. | ข้อมูลเล็กน้อยเพื่อตั้งค่าโปรไฟล์ คุณสามารถแก้ไขได้ภายหลัง |   |   |
| `onboard.section_required` | Required | ข้อมูลที่จำเป็น |   |   |
| `onboard.section_optional` | Optional — helps us match you with players and tournaments | ไม่บังคับ — ช่วยจับคู่คุณกับผู้เล่นและการแข่งขัน |   |   |
| `onboard.field_display_name` | Display name | ชื่อแสดง |   |   |
| `onboard.field_display_name_help` | How you appear on brackets and registrations. | ชื่อที่จะปรากฏบนสายการแข่งขันและรายการลงทะเบียน |   |   |
| `onboard.field_dob` | Date of birth | วันเกิด |   |   |
| `onboard.field_city` | City | เมือง |   |   |
| `onboard.field_country_placeholder` | Select a country | เลือกประเทศ |   |   |
| `onboard.field_country_search_placeholder` | Search countries… | ค้นหาประเทศ… |   |   |
| `onboard.field_country_no_results` | No matching country. | ไม่พบประเทศที่ตรงกัน |   |   |
| `onboard.field_country_apac_heading` | Asia-Pacific | เอเชีย-แปซิฟิก |   |   |
| `onboard.field_country_other_heading` | All countries | ทุกประเทศ |   |   |
| `onboard.field_phone` | Phone number | เบอร์โทรศัพท์ |   |   |
| `onboard.field_whatsapp` | WhatsApp number | เบอร์ WhatsApp |   |   |
| `onboard.field_gender` | Gender | เพศ |   |   |
| `onboard.field_gender_male` | Male | ชาย |   |   |
| `onboard.field_gender_female` | Female | หญิง |   |   |
| `onboard.field_gender_other` | Other | อื่นๆ |   |   |
| `onboard.field_gender_prefer_not_to_say` | Prefer not to say | ไม่ต้องการระบุ |   |   |
| `onboard.field_gender_placeholder` | Select | เลือก |   |   |
| `onboard.submit` | Save and continue | บันทึกและดำเนินการต่อ |   |   |
| `onboard.submitting` | Saving… | กำลังบันทึก… |   |   |
| `onboard.error_required` | This field is required. | กรุณาระบุข้อมูลในช่องนี้ |   |   |
| `onboard.error_country_invalid` | Please choose a valid country. | กรุณาเลือกประเทศที่ถูกต้อง |   |   |
| `onboard.error_phone_invalid` | Please enter a valid phone number with country code (e.g. +66…). | กรุณาระบุเบอร์โทรศัพท์พร้อมรหัสประเทศ (เช่น +66…) |   |   |
| `onboard.error_submit_generic` | We couldn't save your profile. Please try again. | ไม่สามารถบันทึกโปรไฟล์ได้ กรุณาลองใหม่ |   |   |

### Settings + Registrations + Home

| Key | EN | TH (current) | Verdict | Notes |
|---|---|---|---|---|
| `settings.page_title` | Profile settings | ตั้งค่าโปรไฟล์ |   |   |
| `settings.page_description` | Update any of your profile details. Changes save immediately. | แก้ไขข้อมูลโปรไฟล์ของคุณได้ตลอดเวลา การเปลี่ยนแปลงจะบันทึกทันที |   |   |
| `settings.save_changes` | Save changes | บันทึกการเปลี่ยนแปลง |   |   |
| `settings.saved` | Saved. | บันทึกแล้ว |   |   |
| `registrations.page_title` | Your registrations | การลงทะเบียนของคุณ |   |   |
| `registrations.page_description` | Tournaments you're entered into. | การแข่งขันที่คุณลงทะเบียนเข้าร่วม |   |   |
| `registrations.empty_state_title` | No registrations yet | ยังไม่มีการลงทะเบียน |   |   |
| `registrations.empty_state_body` | When tournaments open for registration, you'll see them here. | เมื่อมีการแข่งขันเปิดรับสมัคร คุณจะเห็นรายการที่นี่ |   |   |
| `registrations.browse_tournaments` | Browse tournaments | ดูการแข่งขัน |   |   |
| `home.welcome` | Welcome back, {name} | ยินดีต้อนรับกลับ {name} |   |   |
| `home.tournaments_coming_soon_title` | Tournaments coming soon | การแข่งขันกำลังมา |   | Literal "competitions are coming"; native may prefer "เร็วๆ นี้" |
| `home.tournaments_coming_soon_body` | Tournament browsing and registration arrive in a future release. For now, your profile is set up and ready. | ระบบเรียกดูและลงทะเบียนการแข่งขันจะมาในเวอร์ชันถัดไป ตอนนี้โปรไฟล์ของคุณตั้งค่าเรียบร้อยแล้ว |   |   |
| `home.go_to_settings` | Profile settings | ตั้งค่าโปรไฟล์ |   |   |
| `home.go_to_registrations` | Your registrations | การลงทะเบียนของคุณ |   |   |

### Public landing

| Key | EN | TH (current) | Verdict | Notes |
|---|---|---|---|---|
| `matchday.tagline` | Tournament operations for Asia-Pacific racket sports. | ระบบจัดการแข่งขันกีฬาแร็กเก็ต สำหรับเอเชียแปซิฟิก |   |   |
| `landing.hero_cta_sign_in` | Sign in | เข้าสู่ระบบ |   |   |
| `landing.hero_cta_sign_up` | Sign up | สมัครสมาชิก |   |   |
| `landing.value_prop_2_body` | No refresh button. Scores propagate to every viewer the instant they're entered. | ไม่ต้องกด refresh คะแนนถึงผู้ชมทุกคนทันทีที่กรอก |   | Mixed English "refresh" — confirm acceptable |
| `landing.value_prop_3_title` | From registration to results — one place | ตั้งแต่ลงทะเบียนถึงผลแข่ง — ที่เดียวจบ |   |   |
| `landing.value_props_heading` | Why teams choose Matchday | ทำไมทีมต่าง ๆ จึงเลือก Matchday |   | "ทีม" = "team"; in matchday context the customer is tournament organizer, not "team". Consider "ผู้จัดการแข่งขัน" |
| `landing.how_it_works_title` | How it works | ขั้นตอนการใช้งาน |   |   |
| `landing.how_it_works_step_1_title` | Apply | สมัคร |   |   |
| `landing.how_it_works_step_1_body` | Become an approved tournament organizer. | สมัครเป็นผู้จัดการแข่งขันที่ได้รับอนุมัติ |   |   |
| `landing.how_it_works_step_2_title` | Create | สร้าง |   |   |
| `landing.how_it_works_step_2_body` | Set up your tournament and venue. | ตั้งค่าการแข่งขันและสนาม |   |   |
| `landing.how_it_works_step_3_title` | Publish | เผยแพร่ |   |   |
| `landing.how_it_works_step_3_body` | Open registration. Players sign up. | เปิดรับสมัคร ผู้เล่นลงทะเบียน |   |   |
| `landing.how_it_works_step_4_title` | Run | ดำเนินการ |   |   |
| `landing.how_it_works_step_4_body` | Score live. Players watch the bracket update. | ให้คะแนนสด ผู้เล่นเห็นสายอัปเดตทันที |   |   |
| `landing.footer_copyright` | © Matchday — Tournament operations for Asia-Pacific racket sports. | © Matchday — ระบบจัดการแข่งขันกีฬาแร็กเก็ต สำหรับเอเชียแปซิฟิก |   |   |
| `a11y.skip_to_main` | Skip to main content | ข้ามไปยังเนื้อหาหลัก |   |   |
| `footer.about_link` | About | เกี่ยวกับ |   | Short footer label |
| `footer.privacy_link` | Privacy | ความเป็นส่วนตัว |   | Short label in global footer; needs to be readable in TH at small font |
| `footer.terms_link` | Terms | ข้อกำหนด |   | Same — short |
| `not_found.title` | Page not found | ไม่พบหน้าที่ต้องการ |   | 404 page H1 |
| `not_found.body` | The page you're looking for doesn't exist or has moved. | หน้าที่คุณกำลังค้นหาไม่มีอยู่หรือถูกย้ายไปแล้ว |   |   |
| `not_found.cta_home` | Go home | กลับหน้าหลัก |   |   |
| `not_found.cta_sign_in` | Sign in | เข้าสู่ระบบ |   | Matches existing sign_in.card_title register |

---

## Bucket D — Intentionally unchanged (no review needed)

These are intentionally identical or near-identical between EN and TH —
brand names, format placeholders, dev-only strings.

| Key | Reason |
|---|---|
| `matchday.title: "Matchday"` | Brand name — never translated |
| `locale.switch_to_th: "ไทย"` / `switch_to_en: "English"` | Self-naming locale buttons — universal pattern |
| `sign_in.email_placeholder: "you@example.com"` | Example email format — universal |
| `sign_in.local_dev_note` | Dev-only string; references "Supabase inbucket" service name |
| `onboard.field_phone_placeholder: "+66…"` | E.164 format hint — universal |
| `onboard.field_whatsapp_placeholder: "+66…"` | Same |
| `onboard.field_line_id: "LINE ID"` | LINE app uses "LINE ID" globally including in Thai usage |
| `smoke_test.*` | v0.1.0 dev-only smoke test surface; not user-facing in v0.2.0+ |

---

## Bucket E — Welcome email (matchday-backend)

Added 2026-04-27 after the welcome-email template refactor (commit
654776e) pulled Thai/English copy into a `STRINGS` map at
`matchday-backend/supabase/functions/_shared/templates/welcome.ts`.
These ship in the actual email body — review priority sits between A
(legal) and B (sport-specific) since the email is the user's first
direct comms from Matchday.

| Key (in STRINGS map) | EN | TH (current) | Verdict | Notes |
|---|---|---|---|---|
| `en/th.subject` | Welcome to Matchday | ยินดีต้อนรับสู่ Matchday |   | Subject line — sets tone for first contact |
| `en/th.greeting` | Welcome, {name} | ยินดีต้อนรับ, {name} |   | First line of body |
| `en/th.body` | Your Matchday player profile is ready. You can now sign up for tournaments, track results, and connect with other padel players. | โปรไฟล์ผู้เล่น Matchday ของคุณพร้อมใช้งานแล้ว คุณสามารถสมัครเข้าร่วมการแข่งขัน ติดตามผลการแข่งขัน และเชื่อมต่อกับผู้เล่นพาเดลคนอื่นๆ ได้ |   | Padel-vocab applies — confirm "พาเดล" transliteration is what Bangkok community uses |
| `en/th.ignore_note` | If you didn't sign up for Matchday, you can safely ignore this email — your profile won't be activated until you log in again. | หากคุณไม่ได้สมัครใช้ Matchday สามารถละเว้นอีเมลนี้ได้ โปรไฟล์ของคุณจะไม่ถูกเปิดใช้งานจนกว่าคุณจะเข้าสู่ระบบอีกครั้ง |   | Anti-phishing footer — wording slightly defensive on purpose |

---

## Bucket F — Privacy policy stub (HIGHEST priority — PDPA compliance)

Added 2026-04-27 with the `/[locale]/privacy` page (commit landing
this session). The page is explicitly DRAFT — placeholder bracket-style
text is INTENTIONAL until Pap's data-protection counsel writes the
actual content. Reviewer's job here is structural ("are these the right
6 PDPA sections, in the right order, using the right Thai legal
terminology?") not content-fill ("fill in the [DPO email]").

| Key | EN | TH (current) | Verdict | Notes |
|---|---|---|---|---|
| `privacy.page_title` | Privacy policy | นโยบายความเป็นส่วนตัว |   | Standard term — confirm |
| `privacy.draft_banner` | DRAFT — pending legal review… | ฉบับร่าง — รอการตรวจสอบทางกฎหมาย… |   | Make sure "ฉบับร่าง" reads as DRAFT, not "edition/issue" |
| `privacy.intro` | This notice explains how Matchday collects… | นโยบายนี้อธิบายวิธีที่ Matchday รวบรวม… |   | One-sentence intro — verify natural Thai |
| `privacy.section_controller_title` | 1. Data controller | 1. ผู้ควบคุมข้อมูลส่วนบุคคล |   | PDPA term — "ผู้ควบคุมข้อมูล" is the canonical translation; verify |
| `privacy.section_controller_body` | [Legal entity name…] | [ชื่อนิติบุคคล…] |   | Bracket placeholders preserved for lawyer fill |
| `privacy.section_data_title` | 2. Personal data we collect | 2. ข้อมูลส่วนบุคคลที่เราเก็บรวบรวม |   |   |
| `privacy.section_data_body` | Account identity (email, display name)… | ข้อมูลบัญชี (อีเมล ชื่อแสดง)… |   | Verify field name translations (DOB, gender, city, country, etc.) match `onboard.field_*` keys above |
| `privacy.section_purpose_title` | 3. Purpose of processing | 3. วัตถุประสงค์ของการประมวลผลข้อมูล |   |   |
| `privacy.section_purpose_body` | Authenticating you, matching you with tournaments… | เพื่อยืนยันตัวตน จับคู่คุณกับการแข่งขัน… |   |   |
| `privacy.section_retention_title` | 4. Retention | 4. ระยะเวลาเก็บรักษาข้อมูล |   |   |
| `privacy.section_retention_body` | [Retention period…] | [ระยะเวลาเก็บรักษา…] |   | Lawyer fills in actual retention duration |
| `privacy.section_rights_title` | 5. Your rights | 5. สิทธิของเจ้าของข้อมูล |   | "เจ้าของข้อมูล" = data subject — PDPA term |
| `privacy.section_rights_body` | Under Thai PDPA you may request access… | ภายใต้ พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล… |   | All 7 PDPA rights enumerated — verify completeness |
| `privacy.section_contact_title` | 6. Contact | 6. ช่องทางติดต่อ |   |   |
| `privacy.section_contact_body` | Questions about this policy… PDPC, Thailand. | คำถามเกี่ยวกับนโยบายนี้… (PDPC) ประเทศไทย |   | Reference to PDPC office — confirm accurate Thai name |
| `privacy.back_to_onboard` | Back to /onboard | กลับไปหน้า /onboard |   |   |

**PDPA-specific items requiring legal review** (not just translation):
- Whether the 7-rights list in `section_rights_body` is exhaustive
  per the current Thai PDPA + amendments
- Whether the "soft-delete window" language in retention is acceptable
- Whether the data list in `section_data_body` covers everything we
  actually collect (cross-check `onboard-form.tsx` field set)

---

## Bucket G — Terms of Service stub (HIGHEST priority — legal review)

Added 2026-04-27 with the `/[locale]/terms` page. Same scaffold shape
as Bucket F (privacy): visible DRAFT banner + bracket-style placeholders
preserved for counsel fill-in. Reviewer's job here is structural ("are
these the right 6 ToS sections in the right order, using natural Thai
legal terminology?") plus ensuring the placeholders survive the
translation review (don't expand bracket text into actual content).

| Key | EN | TH (current) | Verdict | Notes |
|---|---|---|---|---|
| `terms.page_title` | Terms of service | ข้อกำหนดการให้บริการ |   | Confirm canonical Thai term |
| `terms.draft_banner` | DRAFT — pending legal review… | ฉบับร่าง — รอการตรวจสอบทางกฎหมาย… |   | Same `ฉบับร่าง` as privacy — keep consistent |
| `terms.intro` | These terms govern your use of Matchday… | ข้อกำหนดเหล่านี้ใช้บังคับการใช้งาน Matchday… |   | One-sentence intro |
| `terms.section_acceptance_title` | 1. Acceptance and accounts | 1. การยอมรับและบัญชีผู้ใช้ |   |   |
| `terms.section_acceptance_body` | You must be 13 or older… | ผู้ใช้งานต้องมีอายุ 13 ปีขึ้นไป… |   | Mirrors `sign_in.min_age_notice` — keep age threshold consistent |
| `terms.section_use_title` | 2. Acceptable use | 2. การใช้งานที่ยอมรับได้ |   |   |
| `terms.section_use_body` | Use Matchday for its intended purpose… | ใช้ Matchday ตามวัตถุประสงค์ที่ตั้งใจไว้… |   | Padel-vocab applies for "พาเดล" (Bucket B already flagged) |
| `terms.section_content_title` | 3. User content and intellectual property | 3. เนื้อหาผู้ใช้และทรัพย์สินทางปัญญา |   |   |
| `terms.section_content_body` | You retain rights to content you submit… | คุณยังคงเป็นเจ้าของเนื้อหาที่ส่งเข้ามา… |   | Bracket placeholder for "[นิติบุคคล — Pap กรอก]" preserved |
| `terms.section_disclaimer_title` | 4. Disclaimers and liability | 4. ข้อปฏิเสธและการรับผิด |   | Section name — confirm canonical term |
| `terms.section_disclaimer_body` | [Pap to fill in with counsel.] Service provided as-is… | [Pap กรอกร่วมกับที่ปรึกษากฎหมาย] บริการให้ตามสภาพที่เป็น… |   | Liability cap placeholder preserved |
| `terms.section_termination_title` | 5. Termination and changes | 5. การยกเลิกและการเปลี่ยนแปลง |   |   |
| `terms.section_termination_body` | You may close your account at any time… | คุณสามารถปิดบัญชีได้ตลอดเวลา… |   | Cross-references `/me/settings` route |
| `terms.section_law_title` | 6. Governing law and contact | 6. กฎหมายที่ใช้บังคับและช่องทางติดต่อ |   |   |
| `terms.section_law_body` | These terms are governed by Thai law… courts of Bangkok | ข้อกำหนดเหล่านี้อยู่ภายใต้กฎหมายไทย… เขตอำนาจศาลกรุงเทพ |   | "เขตอำนาจศาลกรุงเทพ" — confirm. Some ToS specify "ศาลแพ่งกรุงเทพใต้" or similar specific court |
| `terms.back_to_onboard` | Back to /onboard | กลับไปหน้า /onboard |   |   |

**Legal review items beyond translation:**
- Liability cap structure (where to put the explicit number)
- Whether 13+ minimum age belongs in ToS too OR is privacy-only sufficient
- Whether "courts of Bangkok" specificity is correct or needs the actual court name
- Whether the IP grant language (non-exclusive license) is acceptable for a Thai-jurisdiction service
- Whether the `[N] days' notice` for term changes meets any statutory minimum

---

## Bucket H — About page (MEDIUM priority — brand copy)

Added 2026-04-27 with the `/[locale]/about` page. Content is brand
copy, NOT legal — reviewer's job here is making sure the Thai reads
naturally to a Bangkok-padel-community ear. Pap can also iterate on
the actual wording without counsel review.

| Key | EN | TH (current) | Verdict | Notes |
|---|---|---|---|---|
| `about.page_title` | About Matchday | เกี่ยวกับ Matchday |   |   |
| `about.intro` | Matchday is the tournament-operations layer for Asia-Pacific racket sports… Bangkok's padel scene grew faster than the tools meant to support it. | Matchday คือระบบจัดการแข่งขันสำหรับกีฬาแร็กเก็ตในเอเชียแปซิฟิก… วงการพาเดลในกรุงเทพเติบโตเร็วกว่าเครื่องมือที่มีอยู่ |   | Brand-tagline-shaped intro; reviewer flags awkward phrasing |
| `about.section_what_title` | What it does | สิ่งที่ Matchday ทำ |   |   |
| `about.section_what_body` | Tournament organizers create draws, run live scoring… One place — registration through results. | ผู้จัดการแข่งขันสร้างสาย ให้คะแนนสด… ที่เดียวจบ ตั้งแต่ลงทะเบียนถึงผลแข่ง |   | Re-uses padel vocab from Buckets B + C — keep consistent |
| `about.section_who_title` | Who it's for | เหมาะสำหรับใคร |   |   |
| `about.section_who_body` | Padel and racket-sport tournament organizers across the Asia-Pacific. Players who want their tournament results in one place. Spectators who want the bracket to update without refreshing. | ผู้จัดการแข่งขันพาเดลและกีฬาแร็กเก็ตในเอเชียแปซิฟิก… ผู้ชมที่อยากเห็นสายอัปเดตโดยไม่ต้องรีเฟรช |   | "รีเฟรช" mixed-English (matches `landing.value_prop_2_body` already flagged) |
| `about.section_cta_title` | Ready to play | พร้อมเริ่มเล่นแล้วใช่ไหม |   |   |
| `about.section_cta_body` | Sign in to set up a player profile. Tournament-organizer onboarding lands in v0.3. | เข้าสู่ระบบเพื่อตั้งค่าโปรไฟล์ผู้เล่น การลงทะเบียนสำหรับผู้จัดการแข่งขันจะมาในเวอร์ชัน v0.3 |   |   |
| `about.cta_button` | Sign in | เข้าสู่ระบบ |   | Matches existing `sign_in.card_title` register |

---

## Out of scope for this review

- Future transactional emails (password reset, registration confirmation,
  bounce notice). Those will be added to this checklist incrementally as
  templates land.
- Future v0.3+ in-app strings — review per-feature, not in another big batch.

---

## After the review

1. Mark each row's Verdict column.
2. For ✗ rows, add the proposed Thai rewrite in Notes.
3. Hand back this file (or commit directly).
4. I'll apply the rewrites in a single PR with one commit per bucket
   for clean diff history.

This document does not need to live in the matchday-web repo — it's a
process artifact for the review pass. It stays in
`matchday/Plans/v02-th-i18n-review.md` as the source of truth until
the review completes; after that, `messages/th.json` is updated and
this file gets archived (or marked complete in v0.3+).
