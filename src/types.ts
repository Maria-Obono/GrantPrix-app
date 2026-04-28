export enum Region {
  GLOBAL = 'Global',
  NORTH_AMERICA = 'North America',
  EUROPE = 'Europe',
  ASIA = 'Asia',
  AFRICA = 'Africa',
  LATAM = 'Latin America',
  OCEANIA = 'Oceania',
}

export enum LocationType {
  USA = 'USA',
  GLOBAL = 'Global',
  VIRTUAL = 'Virtual',
}

export enum FundingType {
  FULL = 'Full',
  PARTIAL = 'Partial',
}

export enum ApplicationStatus {
  BOOKMARKED = 'Bookmarked',
  IN_PROGRESS = 'In Progress',
  APPLIED = 'Applied',
  ACCEPTED = 'Accepted',
  REJECTED = 'Rejected',
}

export interface UserApplication {
  conferenceId: string;
  status: ApplicationStatus;
  updatedAt: string;
  notes?: string;
}

export interface GrantCoverage {
  flight: boolean;
  hotel: boolean;
  ticket: boolean;
  stipend?: boolean;
}

export interface Conference {
  id: string;
  name: string;
  description: string;
  location: string;
  region: Region;
  locationType: LocationType;
  fundingType: FundingType;
  field: string;
  startDate: string;
  endDate: string;
  grantDeadline: string;
  grantCoverage?: GrantCoverage;
  applicationUrl: string;
  tags: string[];
  eligibility?: string;
  isHidden?: boolean; // For Pro users only
  isComingSoon?: boolean; // If application is not yet open
  isVerified?: boolean;
  imageUrl?: string;
  createdAt?: any;
}

export interface SuccessStory {
  id: string;
  userName: string;
  userRole: string;
  conferenceName: string;
  story: string;
  avatarUrl: string;
}

export interface Subscription {
  email: string;
  regions: Region[];
  interests: string[];
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  location?: string;
  primaryGoal?: string;
  experienceYears?: number;
  interests?: string[];
  impactAreas?: string[];
  occupation?: string;
  isPremium?: boolean;
  aiReviewCount?: number;
  completionPercentage?: number;
  matchesFound?: number;
  isVerified?: boolean;
  savedConferences?: string[]; // Array of conference IDs
  applications?: UserApplication[];
  createdAt?: string;
  updatedAt?: string;
}

export interface Review {
  id: string;
  conferenceId: string;
  userId: string;
  userName: string;
  rating: number;
  comment: string;
  status: 'pending' | 'approved' | 'denied';
  createdAt: string;
}

export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'new_grant' | 'deadline_reminder' | 'system' | 'admin_alert' | 'status_change';
  isRead: boolean;
  createdAt: string;
}

export interface OpportunitySubmission extends Omit<Conference, 'id'> {
  id: string;
  submittedBy: string;
  submitterName: string;
  status: 'pending' | 'approved' | 'denied';
}
