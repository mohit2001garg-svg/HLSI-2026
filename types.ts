
export enum BlockStatus {
  PURCHASED = 'Purchased',
  GANTRY = 'Gantry',
  CUTTING = 'Cutting',
  PROCESSING = 'Processing',
  RESINING = 'Resining',
  COMPLETED = 'Completed', // This is "Ready Stock"
  IN_STOCKYARD = 'In Stockyard',
  SOLD = 'Sold'
}

export type ProcessingStage = 'Field' | 'Resin Plant';
export type PreCuttingProcess = 'None' | 'TENNAX' | 'VACCUM';
export type StockyardLocation = 'Showroom' | 'Service Lane' | 'Field' | 'RP Yard';
export type ResinTreatmentType = 'Resin' | 'GP' | 'CC';

export interface PowerCut {
  id: string;
  start: string; 
  end: string;   
  durationMinutes: number;
}

export interface Branding {
  logoUrl: string;
  companyName: string;
  shortName: string;
}

export interface Block {
  id: string;
  jobNo: string;
  company: string; 
  material: string;
  minesMarka: string; 
  length: number;
  width: number;
  height: number;
  weight: number; 
  arrivalDate: string;
  status: BlockStatus;
  isPriority: boolean;
  isToBeCut?: boolean; // New field for "To Be Cut" queue
  assignedMachineId?: string;
  cutByMachine?: string; 
  enteredBy: StaffMember; 
  
  // Purchase Fields
  country?: string;
  supplier?: string;
  forwarder?: string; // NEW: CHA / Forwarder
  shipmentGroup?: string; // NEW: Grouping for shipments
  loadingDate?: string;
  expectedArrivalDate?: string;

  // Cutting Details
  thickness?: string;

  // Pre-Cutting Processing
  preCuttingProcess: PreCuttingProcess;
  
  // Hand-off state
  isSentToResin?: boolean;

  // Time Tracking Fields
  startTime?: string;
  endTime?: string;
  powerCuts: PowerCut[];
  totalCuttingTimeMinutes?: number;

  // Production Results
  slabLength?: number; // New Field
  slabWidth?: number;  // New Field
  slabCount?: number;
  totalSqFt?: number;

  // Processing Fields
  processingStage?: ProcessingStage;
  processingStartedAt?: string;

  // Resin Line Tracking
  resinStartTime?: string;
  resinEndTime?: string;
  resinPowerCuts?: PowerCut[];
  resinTreatmentType?: ResinTreatmentType;

  // Stockyard Fields
  stockyardLocation?: StockyardLocation;
  transferredToYardAt?: string;
  msp?: string; // Minimum Selling Price (Alpha-numeric)

  // Sales Fields
  soldTo?: string;
  billNo?: string;
  soldAt?: string;
}

export enum MachineId {
  MACHINE_1 = 'Machine 1',
  MACHINE_2 = 'Machine 2',
  THIN_WIRE = 'Thin Wire Machine'
}

// Changed to string to allow any name from Supabase staff table
export type StaffMember = string;

export type View = 'dashboard' | 'purchase' | 'block-arrival' | 'gantry-stock' | 'machine-status' | 'resin-line' | 'processing' | 'ready-stock' | 'stockyard' | 'sold-history' | 'settings';
