
import { createClient } from '@supabase/supabase-js';
import { Block, BlockStatus, StaffMember, PowerCut } from '../types';

const SUPABASE_URL = 'https://tzlwwwelfdbjezwtertm.supabase.co';
const SUPABASE_KEY = 'sb_publishable_uOWf2wCYa7gf4JiXAh_Lqw_YlsuxNgy';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const fromDb = (row: any): Block => ({
  id: row.id,
  jobNo: row.job_no,
  company: row.company,
  material: row.material,
  minesMarka: row.mines_marka,
  length: Number(row.length),
  width: Number(row.width),
  height: Number(row.height),
  weight: Number(row.weight),
  arrivalDate: row.arrival_date ? String(row.arrival_date) : '',
  status: row.status as BlockStatus,
  isPriority: row.is_priority,
  isToBeCut: row.is_to_be_cut,
  assignedMachineId: row.assigned_machine_id,
  cutByMachine: row.cut_by_machine,
  enteredBy: row.entered_by as StaffMember,
  thickness: row.thickness,
  preCuttingProcess: row.pre_cutting_process,
  isSentToResin: row.is_sent_to_resin,
  startTime: row.start_time,
  endTime: row.end_time,
  powerCuts: row.power_cuts || [],
  totalCuttingTimeMinutes: row.total_cutting_time_minutes,
  slabLength: row.slab_length,
  slabWidth: row.slab_width,
  slabCount: row.slab_count,
  totalSqFt: row.total_sq_ft,
  processingStage: row.processing_stage,
  processingStartedAt: row.processing_started_at,
  resinStartTime: row.resin_start_time,
  resinEndTime: row.resin_end_time,
  resinPowerCuts: row.resin_power_cuts || [],
  resinTreatmentType: row.resin_treatment_type,
  stockyardLocation: row.stockyard_location,
  transferredToYardAt: row.transferred_to_yard_at,
  msp: row.msp,
  soldTo: row.sold_to,
  billNo: row.bill_no,
  soldAt: row.sold_at,
  country: row.country,
  supplier: row.supplier,
  forwarder: row.cha_forwarder,
  shipmentGroup: row.shipment_group,
  loadingDate: row.loading_date ? String(row.loading_date) : undefined,
  expectedArrivalDate: row.expected_arrival_date ? String(row.expected_arrival_date) : undefined
});

const toDb = (block: Partial<Block>) => {
  const mapped: any = {};
  if (block.jobNo !== undefined) mapped.job_no = block.jobNo;
  if (block.company !== undefined) mapped.company = block.company;
  if (block.material !== undefined) mapped.material = block.material;
  if (block.minesMarka !== undefined) mapped.mines_marka = block.minesMarka;
  if (block.length !== undefined) mapped.length = block.length;
  if (block.width !== undefined) mapped.width = block.width;
  if (block.height !== undefined) mapped.height = block.height;
  if (block.weight !== undefined) mapped.weight = block.weight;
  if (block.arrivalDate !== undefined) mapped.arrival_date = block.arrivalDate;
  if (block.status !== undefined) mapped.status = block.status;
  if (block.isPriority !== undefined) mapped.is_priority = block.isPriority;
  if (block.isToBeCut !== undefined) mapped.is_to_be_cut = block.isToBeCut;
  
  // Robustly handle clearing machine assignment
  if (block.assignedMachineId !== undefined) {
    mapped.assigned_machine_id = (block.assignedMachineId === '' || block.assignedMachineId === null) ? null : block.assignedMachineId;
  }
  if (block.startTime !== undefined) {
    mapped.start_time = (block.startTime === '' || block.startTime === null) ? null : block.startTime;
  }

  if (block.cutByMachine !== undefined) mapped.cut_by_machine = block.cutByMachine;
  if (block.enteredBy !== undefined) mapped.entered_by = block.enteredBy;
  if (block.thickness !== undefined) mapped.thickness = block.thickness;
  if (block.preCuttingProcess !== undefined) mapped.pre_cutting_process = block.preCuttingProcess;
  if (block.isSentToResin !== undefined) mapped.is_sent_to_resin = block.isSentToResin;
  if (block.endTime !== undefined) mapped.end_time = block.endTime;
  if (block.powerCuts !== undefined) mapped.power_cuts = block.powerCuts;
  if (block.totalCuttingTimeMinutes !== undefined) mapped.total_cutting_time_minutes = block.totalCuttingTimeMinutes;
  if (block.slabLength !== undefined) mapped.slab_length = block.slabLength;
  if (block.slabWidth !== undefined) mapped.slab_width = block.slabWidth;
  if (block.slabCount !== undefined) mapped.slab_count = block.slabCount;
  if (block.totalSqFt !== undefined) mapped.total_sq_ft = block.totalSqFt;
  if (block.processingStage !== undefined) mapped.processing_stage = block.processingStage;
  if (block.processingStartedAt !== undefined) mapped.processing_started_at = block.processingStartedAt;
  if (block.resinStartTime !== undefined) mapped.resin_start_time = block.resinStartTime;
  if (block.resinEndTime !== undefined) mapped.resin_end_time = block.resinEndTime;
  if (block.resinPowerCuts !== undefined) mapped.resin_power_cuts = block.resinPowerCuts;
  if (block.resinTreatmentType !== undefined) mapped.resin_treatment_type = block.resinTreatmentType;
  if (block.stockyardLocation !== undefined) mapped.stockyard_location = block.stockyardLocation;
  if (block.transferredToYardAt !== undefined) mapped.transferred_to_yard_at = block.transferredToYardAt;
  if (block.msp !== undefined) mapped.msp = block.msp;
  if (block.soldTo !== undefined) mapped.sold_to = block.soldTo;
  if (block.billNo !== undefined) mapped.bill_no = block.billNo;
  if (block.soldAt !== undefined) mapped.sold_at = block.soldAt;
  if (block.country !== undefined) mapped.country = block.country;
  if (block.supplier !== undefined) mapped.supplier = block.supplier;
  if (block.forwarder !== undefined) mapped.cha_forwarder = block.forwarder;
  if (block.shipmentGroup !== undefined) mapped.shipment_group = block.shipmentGroup;
  
  if (block.loadingDate !== undefined) mapped.loading_date = block.loadingDate === '' ? null : block.loadingDate;
  if (block.expectedArrivalDate !== undefined) mapped.expected_arrival_date = block.expectedArrivalDate === '' ? null : block.expectedArrivalDate;
  
  return mapped;
};

export const checkPermission = (staff: StaffMember | null, company: string): boolean => {
  if (!staff || staff === 'GUEST') return false;
  if (staff === 'VAIBHAV') return true;
  const normalize = (str: string) => str.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return normalize(company) === normalize(staff);
};

export const db = {
  fetchInventory: async (): Promise<Block[]> => {
    const { data, error } = await supabase.from('inventory').select('*').order('created_at', { ascending: false });
    if (error) return [];
    return (data || []).map(fromDb);
  },

  fetchStaffList: async (): Promise<string[]> => {
    const { data, error } = await supabase.from('staff').select('name').order('name');
    if (error) return ['GUEST'];
    return (data || []).map(s => s.name);
  },

  addBlock: async (block: Block) => {
    const { error } = await supabase.from('inventory').insert([{ ...toDb(block), id: block.id }]);
    if (error) throw error;
  },

  addBlocks: async (blocks: Block[]) => {
    const rows = blocks.map(b => ({ ...toDb(b), id: b.id }));
    const { error } = await supabase.from('inventory').insert(rows);
    if (error) throw error;
  },

  upsertBlocks: async (blocks: Block[]) => {
    const rows = blocks.map(b => ({ ...toDb(b), id: b.id }));
    const { error } = await supabase.from('inventory').upsert(rows, { onConflict: 'job_no' });
    if (error) throw error;
  },

  updateBlock: async (id: string, updates: Partial<Block>) => {
    const { error } = await supabase.from('inventory').update(toDb(updates)).eq('id', id);
    if (error) throw error;
  },

  deleteBlock: async (id: string) => {
    const { error } = await supabase.from('inventory').delete().match({ id: id });
    if (error) throw error;
    return true;
  },

  deleteBlocks: async (ids: string[]) => {
    const { error } = await supabase.from('inventory').delete().in('id', ids);
    if (error) throw error;
    return true;
  },

  verifyPin: async (staffName: string, pin: string): Promise<boolean> => {
    const { data, error } = await supabase.from('staff').select('pin').eq('name', staffName).single();
    if (error || !data) return false;
    return String(data.pin) === String(pin);
  },

  addStaff: async (name: string, pin: string) => {
    const { error } = await supabase.from('staff').insert([{ name: name.toUpperCase(), pin }]);
    if (error) throw error;
  },

  updateStaffPin: async (name: string, newPin: string) => {
    const { error } = await supabase.from('staff').update({ pin: newPin }).eq('name', name);
    if (error) throw error;
  },

  deleteStaff: async (name: string) => {
    const { error } = await supabase.from('staff').delete().eq('name', name);
    if (error) throw error;
  }
};
