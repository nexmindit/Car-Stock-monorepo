# รายงานสรุปยอดขาย: ตัวกรองสถานะผิดค่า และ PDF/พิมพ์ไม่กรองประเภทรถ

- วันที่แก้: 24 ต.ค. 2569
- พบใน: v1.0.67 (main `dea54b4`)
- แก้ใน branch: `feat/customer-feedback-2026-10` (ระลอก 4)

## บั๊ก 1 — ตัวเลือก "สถานะ" ส่วนใหญ่ใช้ไม่ได้

### อาการ
หน้ารายงานสรุปยอดขาย มีตัวเลือกสถานะ 9 ค่า (ใบเสนอราคา, รอวางมัดจำ, รับมัดจำแล้ว, รอไฟแนนซ์,
ไฟแนนซ์อนุมัติ, เตรียมส่งมอบ, ส่งมอบแล้ว, สำเร็จ, ยกเลิก) เลือกแล้วส่วนใหญ่ขึ้น error
(ก่อนแก้ระลอก 2 ขึ้นเป็น "Database error occurred" ดู [validation-500](../2026-10-24-v1.0.67-validation-500/README.md))
มีแค่ "ส่งมอบแล้ว" กับ "สำเร็จ" ที่ใช้ได้ ส่วน "ยกเลิก" ใช้ไม่ได้เพราะสะกด `CANCELED` แต่ระบบใช้ `CANCELLED`

### มาจากไหน
- commit `2a0bb10` (5 ธ.ค. 2568, "feat: add comprehensive report types ...") มีตั้งแต่ก่อน v1.0.1
- หน้าเว็บฮาร์ดโค้ดรายการสถานะชุดเก่า ซึ่งไม่ตรงกับ `SaleStatus` ใน `schema.prisma`
  (`RESERVED`, `PREPARING`, `DELIVERED`, `COMPLETED`, `CANCELLED`)
- ฝั่ง API `GET /reports/sales-summary` ตรวจ query ด้วย `t.Union` 5 ค่าที่ถูก จึงปฏิเสธค่าอื่นทั้งหมด
- ฝั่ง `GET /reports/sales-summary/pdf` รับ `status` เป็น `t.String()` อะไรก็ได้ แล้วส่งต่อให้ Prisma ซึ่งปฏิเสธค่า enum ที่ไม่มีจริง

### วิธีแก้
- `SalesSummaryReportPage.tsx`: สร้างตัวเลือกจาก `SALE_STATUS_LABELS` ใน `@car-stock/shared/constants`
  (จองแล้ว / เตรียมส่งมอบ / ส่งมอบแล้ว / เสร็จสิ้น / ยกเลิก) ไม่ฮาร์ดโค้ดอีก
- `sales-summary.helpers.ts`: เพิ่ม `SALE_STATUS_FILTER_VALUES` แล้วให้ทั้ง endpoint JSON และ PDF ใช้ schema `status` ตัวเดียวกัน
  (`saleStatusFilterQuery` ใน `reports.controller.ts`) ค่าผิดได้ 400 `VALIDATION_ERROR` ทั้งสองทาง

## บั๊ก 2 — PDF และปุ่มพิมพ์ไม่สนตัวกรองประเภทรถ

### อาการ
กรองประเภทรถ (เช่น เก๋ง) บนหน้าจอแล้วตารางถูก แต่กด "ส่งออก PDF" หรือ "พิมพ์" ได้รายการทุกประเภท

### มาจากไหน
- commit `22d677f` (18 เม.ย. 2569, "feat(web): sales summary page — vehicleType filter + 3-sheet export") เข้า v1.0.24
  เพิ่มตัวกรองประเภทรถให้หน้าจอและ endpoint JSON แต่ไม่ได้ต่อไปถึง PDF:
  - `report.service.ts` `getSalesSummaryReportPdf()` ไม่ส่ง `vehicleType`
  - หน้าเว็บไม่ส่ง `vehicleType` ทั้งปุ่ม PDF และปุ่มพิมพ์
  - `GET /reports/sales-summary/pdf` ไม่รับ `vehicleType` และไม่ส่งต่อให้ `getSalesSummaryReport`

### วิธีแก้
- API: endpoint PDF รับ `vehicleType` และ `status` แบบเดียวกับ JSON แล้วเรียก service ด้วยตัวกรองชุดเดียวกัน
- หัว PDF แสดงบรรทัดตัวกรองใต้ช่วงเวลา เช่น `สถานะ: เสร็จสิ้น · ประเภทรถ: เก๋ง`
  (ชื่อไทยดึงจากตาราง `vehicle_types`; ฟังก์ชัน `describeSalesSummaryFilters()` มีเทสต์ใน `reports-helpers.test.ts`)
- เว็บ: เก็บ "ตัวกรองที่ใช้กับข้อมูลบนจอ" (`appliedFilters`) ตอนกด กรองข้อมูล
  แล้วให้ PDF, พิมพ์ และ Excel ใช้ชุดนี้ (ช่วงวันที่ สถานะ และประเภทรถ) ถ้าผู้ใช้เปลี่ยนวันที่หรือ dropdown แต่ยังไม่กด กรองข้อมูล ไฟล์ที่ได้จะยังตรงกับตารางบนจอ
  (แก้เพิ่มหลังรีวิว: รอบแรกเก็บแค่สถานะ/ประเภทรถ วันที่ยังดึงจากช่องกรอกปัจจุบัน และค่าเริ่มต้นวันที่เปลี่ยนจาก
  `toISOString()` (วันตาม UTC — ก่อน 07:00 กลายเป็นเมื่อวาน) เป็น `toDateInputValue()` ตามเวลาเครื่อง)

### Excel
ชีตแรกใช้ข้อมูลบนจอ (กรองแล้ว) ส่วนชีตแยกประเภทรถดึงทุกประเภทตามที่ออกแบบไว้ โดยใช้สถานะชุดเดียวกับข้อมูลบนจอ ไม่มีบั๊กเรื่องประเภทรถ
เดิมชีตแยกประเภทใช้สถานะจาก dropdown ปัจจุบัน ตอนนี้เปลี่ยนเป็น `appliedFilters.status`

## ตรวจสอบแล้ว
- `bun test` ใน apps/api: ผ่านเท่า baseline (fail 88 ตัวเดิม: e2e/puppeteer/backup schedule/daily-payment layout) + เทสต์ใหม่ `describeSalesSummaryFilters` 3 ข้อ
- `cd apps/web && bun run build` ผ่าน
- เรียก API จริง (ช่วง 2020-01-01 ถึง 2030-12-31, ข้อมูล seed):
  - `status` แต่ละค่า: RESERVED 5, PREPARING 5, DELIVERED 5, COMPLETED 32, CANCELLED 5 รวม 52 = ทั้งหมด; `status=QUOTATION` ได้ 400 `VALIDATION_ERROR`
  - PDF ไม่กรอง 52 แถว, `vehicleType=SEDAN` 6 แถว (หัวกระดาษ "ประเภทรถ: เก๋ง"), `MOTORCYCLE` 0 แถว,
    `status=COMPLETED&vehicleType=SEDAN` 4 แถว ตรงกับ JSON ทุกกรณี (นับจากข้อความใน PDF)
