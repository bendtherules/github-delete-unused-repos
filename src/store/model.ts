import { Store, createStore, applyMiddleware } from 'redux';

export namespace FailReasons {
  export enum EachBranchBehindOrEven {
    "remote branch doesn't exist",
    'forked branch ahead',
  }

  export enum NotContributor {
    'contributor in self repo',
    'contributor in parent repo',
  }

  export enum NoCommits {
    'commit in self repo',
    'commit in parent repo',
  }
}

export enum FilterSteps {
  eachBranchBehindOrEven = 'eachBranchBehindOrEven',
  notContributor = 'notContributor',
  noCommits = 'noCommits',
}

export enum FilterStatus {
  'pass',
  'fail',
  'waiting',
}

export interface RepoFilterState {
  [FilterSteps.eachBranchBehindOrEven]: {
    status: FilterStatus;
    failReason?: FailReasons.EachBranchBehindOrEven;
    failBranchName?: string;
  };
  [FilterSteps.notContributor]: {
    status: FilterStatus;
    failReason?: FailReasons.NotContributor;
  };
  [FilterSteps.noCommits]: {
    status: FilterStatus;
    failReason?: FailReasons.NoCommits;
  };
}

export type RepoFilterStateMap = Map<
  string,
  {
    filterState: RepoFilterState;
  }
>;

export interface ApplicationState {
  username: string;
  repoStateMap: RepoFilterStateMap;
}
