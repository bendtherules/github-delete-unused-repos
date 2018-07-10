import { Store, createStore, applyMiddleware } from 'redux';

export namespace FailReasons {
    export enum EachBranchBehindOrEven {
        'remote branch doesn\'t exist',
        'forked branch ahead'
    };

    export enum NotContributor {
        'contributor in self repo',
        'contributor in parent repo'
    };

    export enum NoCommits {
        'commit in self repo',
        'commit in parent repo'
    };

}

export interface GithubRepoFilterState {
    eachBranchBehindOrEven: {
        fail: boolean,
        failReason: FailReasons.EachBranchBehindOrEven
        failBranchName: string
    },
    notContributor: {
        fail: boolean,
        failReason: FailReasons.NotContributor
    },
    noCommits: {
        fail: boolean,
        failReason: FailReasons.NoCommits
    }
}

export type GithubRepoFilterStates = Map<string, {
    filterState: GithubRepoFilterState
}>;

export interface ApplicationState {
    username: string;
    repoStates: GithubRepoFilterStates;
}