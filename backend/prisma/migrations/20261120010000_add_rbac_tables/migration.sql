BEGIN;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "role_id" UUID;

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menus" (
    "id" UUID NOT NULL,
    "menu_name" VARCHAR(100) NOT NULL,
    "menu_path" VARCHAR(255),
    "menu_icon" VARCHAR(64),
    "parent_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_menus" (
    "role_id" UUID NOT NULL,
    "menu_id" UUID NOT NULL,

    CONSTRAINT "role_menus_pkey" PRIMARY KEY ("role_id","menu_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "menus_menu_path_key" ON "menus"("menu_path");

-- CreateIndex
CREATE INDEX "menus_parent_id_sort_order_id_idx" ON "menus"("parent_id", "sort_order", "id");

-- CreateIndex
CREATE INDEX "role_menus_menu_id_idx" ON "role_menus"("menu_id");

-- CreateIndex
CREATE INDEX "users_role_id_idx" ON "users"("role_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menus" ADD CONSTRAINT "menus_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "menus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_menus" ADD CONSTRAINT "role_menus_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_menus" ADD CONSTRAINT "role_menus_menu_id_fkey" FOREIGN KEY ("menu_id") REFERENCES "menus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Basic hierarchy/order checks; multi-node cycle validation belongs in the service.
ALTER TABLE "menus" ADD CONSTRAINT "menus_not_self_parent" CHECK ("parent_id" IS NULL OR "parent_id" <> "id");
ALTER TABLE "menus" ADD CONSTRAINT "menus_nonnegative_sort_order" CHECK ("sort_order" >= 0);

COMMIT;
