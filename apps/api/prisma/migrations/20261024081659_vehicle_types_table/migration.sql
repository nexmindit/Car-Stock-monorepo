-- Vehicle types move from the "VehicleType" enum to an admin-managed table.
-- Existing vehicle_models.type values are kept: the column is cast enum -> text
-- and every former enum value is seeded into vehicle_types before the FK is added.

-- CreateTable
CREATE TABLE "vehicle_types" (
    "code" TEXT NOT NULL,
    "name_th" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_types_pkey" PRIMARY KEY ("code")
);

-- Seed the former enum values
INSERT INTO "vehicle_types" ("code", "name_th", "sort_order", "updated_at") VALUES
    ('SEDAN', 'เก๋ง', 10, CURRENT_TIMESTAMP),
    ('PICKUP', 'กระบะ', 20, CURRENT_TIMESTAMP),
    ('SUV', 'SUV', 30, CURRENT_TIMESTAMP),
    ('CROSSOVER', 'ครอสโอเวอร์', 40, CURRENT_TIMESTAMP),
    ('HATCHBACK', 'แฮทช์แบ็ก', 50, CURRENT_TIMESTAMP),
    ('MPV', 'MPV', 60, CURRENT_TIMESTAMP),
    ('VAN', 'รถตู้', 70, CURRENT_TIMESTAMP),
    ('COUPE', 'คูเป้', 80, CURRENT_TIMESTAMP),
    ('CONVERTIBLE', 'เปิดประทุน', 90, CURRENT_TIMESTAMP),
    ('WAGON', 'สเตชันแวกอน', 100, CURRENT_TIMESTAMP),
    ('TRUCK', 'รถบรรทุก', 110, CURRENT_TIMESTAMP),
    ('EV', 'รถไฟฟ้า (EV)', 120, CURRENT_TIMESTAMP),
    ('MOTORCYCLE', 'มอเตอร์ไซค์', 130, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- AlterTable: enum -> text, keeping the data
ALTER TABLE "vehicle_models" ALTER COLUMN "type" TYPE TEXT USING "type"::text;

-- Safety net: any value not covered above still gets a row so the FK can be added
INSERT INTO "vehicle_types" ("code", "name_th", "sort_order", "updated_at")
SELECT DISTINCT "type", "type", 1000, CURRENT_TIMESTAMP FROM "vehicle_models"
ON CONFLICT ("code") DO NOTHING;

-- DropEnum
DROP TYPE "VehicleType";

-- CreateIndex
CREATE INDEX "vehicle_models_type_idx" ON "vehicle_models"("type");

-- AddForeignKey
ALTER TABLE "vehicle_models" ADD CONSTRAINT "vehicle_models_type_fkey" FOREIGN KEY ("type") REFERENCES "vehicle_types"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
