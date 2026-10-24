# Error ตรวจสอบข้อมูล (VALIDATION) ขึ้นเป็น 500 "Database error occurred"

- วันที่แก้: 24 ต.ค. 2569
- พบใน: v1.0.67 (main `dea54b4`)
- แก้ใน: commit `4a45118` "fix(api): only treat P-codes as Prisma errors in the global handler" (branch `feat/customer-feedback-2026-10` ระลอก 2)

## อาการ
ส่งข้อมูลผิดรูปแบบมาที่ API (body หรือ query ไม่ตรง schema ของ Elysia) ควรได้ 400 `VALIDATION_ERROR` พร้อมบอกช่องที่ผิด
แต่ได้ 500 "Database error occurred" แทน ผู้ใช้และคนแก้บั๊กจึงเข้าใจว่าฐานข้อมูลพัง
ตัวอย่างหนึ่งคือเลือกสถานะ "ใบเสนอราคา" ในรายงานสรุปยอดขาย ([sales-summary-filters](../2026-10-24-v1.0.67-sales-summary-filters/README.md))

## มาจากไหน
- commit `6ff3e08` (9 ก.พ. 2569, "feat: Implement standardized error handling system ...") มีตั้งแต่ก่อน v1.0.1
- `isPrismaError()` ใน `apps/api/src/lib/errors.ts` เช็คแค่ว่า error มี `code` เป็น string
- `ValidationError` ของ Elysia ก็มี `code = 'VALIDATION'` ตัว global `onError` ใน `apps/api/src/index.ts`
  เช็ค `isPrismaError` ก่อนสาขา `code === 'VALIDATION'` จึงส่งเข้า `handlePrismaError()` ซึ่งตอบ 500 "Database error occurred"
- error ระบบอื่นที่มี code string (เช่น `ECONNREFUSED`) ก็โดนแบบเดียวกัน

## วิธีแก้
`isPrismaError()` รับเฉพาะ code รูปแบบ Prisma known-request (`/^P\d{4}$/` เช่น `P2002`, `P2025`)
error อื่นตกไปสาขาที่ถูก: VALIDATION เป็น 400, ที่เหลือเป็น error ทั่วไป

## ตรวจสอบแล้ว
- เทสต์ `apps/api/src/__tests__/errors-prisma-detect.test.ts`: P2002/P2025 เป็น Prisma; `VALIDATION`, `ECONNREFUSED`, Error ธรรมดา ไม่ใช่
- เรียกจริง `GET /api/reports/sales-summary?status=QUOTATION` ได้ 400 `VALIDATION_ERROR` ไม่ใช่ 500
