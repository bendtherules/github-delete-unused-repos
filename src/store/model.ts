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
  forked = 'forked',
  eachBranchBehindOrEven = 'eachBranchBehindOrEven',
  notForkContributor = 'notForkContributor',
  notParentContributor = 'notParentContributor',
  noCommits = 'noCommits',
}

export enum FilterStatus {
  pass = 'pass',
  fail = 'fail',
  waiting = 'waiting',
}

export interface RepoFilterState {
  [FilterSteps.forked]: {
    status: FilterStatus;
  };
  [FilterSteps.eachBranchBehindOrEven]: {
    status: FilterStatus;
    // failReason?: FailReasons.EachBranchBehindOrEven;
    // failBranchName?: string;
  };
  [FilterSteps.notForkContributor]: {
    status: FilterStatus;
    // failReason?: FailReasons.NotContributor;
  };
  [FilterSteps.notParentContributor]: {
    status: FilterStatus;
    // failReason?: FailReasons.NotContributor;
  };
  [FilterSteps.noCommits]: {
    status: FilterStatus;
    // failReason?: FailReasons.NoCommits;
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
