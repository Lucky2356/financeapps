export type UserProfile = {
  id: string;
  name: string;
  color: string;
  createdAt: string;
};

export type ProfileList = {
  profiles: UserProfile[];
  activeProfileId: string;
  /** Куда вернуться из профиля «Пример» — туда, откуда его открыли. */
  returnTo?: string;
};

/** Пример живёт в своём профиле и с настоящими данными не смешивается. */
export const SAMPLE_PROFILE_ID = "profile-sample";
