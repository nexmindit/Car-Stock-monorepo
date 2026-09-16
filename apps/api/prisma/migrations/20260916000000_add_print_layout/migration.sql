-- CreateTable
CREATE TABLE IF NOT EXISTS "print_layouts" (
    "key" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "print_layouts_pkey" PRIMARY KEY ("key")
);
