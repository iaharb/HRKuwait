export type Role = 'staff' | 'manager' | 'hr' | 'ceo';
export type LeaveType = 'Annual' | 'Sick' | 'Emergency' | 'ShortPermission';
export type RequestStatus =
  | 'PENDING'
  | 'DEPUTY_CONFIRMED'
  | 'MANAGER_APPROVED'
  | 'HR_APPROVED'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED';

export interface LaUser {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  department: string | null;
  position: string | null;
  manager_id: string | null;
  joined_on: string | null;
  status: string;
}

export interface LaBalance {
  id: string;
  user_id: string;
  leave_type: LeaveType;
  year: number;
  entitled_days: number;
  used_days: number;
}

export interface LaLeaveRequest {
  id: string;
  requester_id: string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  days: number;
  reason: string | null;
  contact_during: string | null;
  deputy_id: string;
  status: RequestStatus;
  rejection_reason: string | null;
  rejection_step: 'deputy' | 'manager' | 'hr' | 'ceo' | null;
  history: HistoryEntry[];
  created_at: string;
  updated_at: string;
}

export interface HistoryEntry {
  at: string;
  actor: string;
  role?: string;
  action: string;
  note?: string | null;
}

export interface QueueItem {
  request_id: string;
  requester_name: string;
  requester_dept: string | null;
  requester_pos: string | null;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  days: number;
  reason: string | null;
  contact_during: string | null;
  deputy_name: string;
  status: RequestStatus;
  step: 'deputy' | 'manager' | 'hr' | 'ceo' | string;
  requester_manager: string | null;
  created_at: string;
  // Present when routed through the configurable engine.
  engine?: boolean;
  step_code?: string;
  step_name?: string;
  is_final_step?: boolean;
}

export interface ApprovalEntry {
  step: string;
  action: string;
  actor: string;
  note: string | null;
  at: string;
}

export interface RequestPerson {
  id: string;
  name: string;
  department: string | null;
  position?: string | null;
  email?: string | null;
}

export interface RequestDetail {
  request: {
    id: string;
    leave_type: LeaveType;
    start_date: string;
    end_date: string;
    days: number;
    reason: string | null;
    contact_during: string | null;
    status: RequestStatus;
    rejection_reason: string | null;
    rejection_step: string | null;
    created_at: string;
    history: HistoryEntry[];
  };
  requester: RequestPerson;
  deputy: RequestPerson;
  manager: RequestPerson | null;
  approvals: ApprovalEntry[];
}

export interface Notification {
  id: string;
  title: string;
  body: string | null;
  is_read: boolean;
  created_at: string;
  unread: number;
}

export interface RpcResult {
  success: boolean;
  message?: string;
  id?: string;
}