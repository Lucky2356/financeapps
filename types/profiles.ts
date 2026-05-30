export type UserProfile = {
  id: string;
  name: string;
  color: string;
  createdAt: string;
};

export type ProfileList = {
  profiles: UserProfile[];
  activeProfileId: string;
};
