
-- HI-LINE STONE MANAGEMENT SYSTEM - DATABASE REPAIR SCRIPT
-- RUN THIS IN THE SUPABASE SQL EDITOR TO FIX MISSING COLUMN ERRORS

-- 1. Ensure Inventory Table Exists with all required columns
CREATE TABLE IF NOT EXISTS public.inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_no TEXT UNIQUE NOT NULL,
    company TEXT NOT NULL,
    material TEXT NOT NULL,
    mines_marka TEXT,
    length NUMERIC DEFAULT 0,
    width NUMERIC DEFAULT 0,
    height NUMERIC DEFAULT 0,
    weight NUMERIC DEFAULT 0,
    arrival_date DATE DEFAULT CURRENT_DATE,
    status TEXT NOT NULL DEFAULT 'Gantry',
    is_priority BOOLEAN DEFAULT FALSE,
    assigned_machine_id TEXT,
    cut_by_machine TEXT,
    entered_by TEXT,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    power_cuts JSONB DEFAULT '[]',
    total_cutting_time_minutes INTEGER,
    slab_count INTEGER,
    total_sq_ft NUMERIC,
    processing_stage TEXT,
    processing_started_at TIMESTAMPTZ,
    resin_start_time TIMESTAMPTZ,
    resin_end_time TIMESTAMPTZ,
    resin_power_cuts JSONB DEFAULT '[]',
    resin_treatment_type TEXT,
    stockyard_location TEXT,
    transferred_to_yard_at TIMESTAMPTZ,
    sold_to TEXT,
    bill_no TEXT,
    sold_at TIMESTAMPTZ,
    msp TEXT,
    thickness TEXT,
    pre_cutting_process TEXT DEFAULT 'None',
    is_sent_to_resin BOOLEAN DEFAULT FALSE,
    slab_length NUMERIC,
    slab_width NUMERIC,
    is_to_be_cut BOOLEAN DEFAULT FALSE,
    country TEXT,
    supplier TEXT,
    cha_forwarder TEXT,
    shipment_group TEXT,
    loading_date DATE,
    expected_arrival_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. ADD ALL POTENTIALLY MISSING COLUMNS INDIVIDUALLY (Safe to run multiple times)
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS supplier TEXT;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS cha_forwarder TEXT;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS shipment_group TEXT;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS loading_date DATE;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS expected_arrival_date DATE;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS thickness TEXT;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS pre_cutting_process TEXT DEFAULT 'None';
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS is_sent_to_resin BOOLEAN DEFAULT FALSE;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS resin_treatment_type TEXT;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS msp TEXT;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS slab_length NUMERIC;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS slab_width NUMERIC;

-- 3. FIX PERMISSIONS
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "factory_master_access" ON public.inventory;
CREATE POLICY "factory_master_access" ON public.inventory FOR ALL TO public USING (true) WITH CHECK (true);

-- 4. FORCE REFRESH SCHEMA CACHE
NOTIFY pgrst, 'reload config';
