-- SiamK sells Royal Enfield motorcycles; they were keyed as SEDAN for lack of a type.
ALTER TYPE "VehicleType" ADD VALUE IF NOT EXISTS 'MOTORCYCLE';
