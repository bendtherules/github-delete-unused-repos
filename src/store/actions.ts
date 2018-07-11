import { Action } from 'redux';
import { FilterSteps, RepoFilterState } from './model';

export enum ActionNames {
  InitUserName = 'InitUserName',
  InitRepo = 'InitRepo',
  AddRepoFilterStatus = 'AddRepoFilterStatus',
}

export interface InitUserNameArgs extends Action<ActionNames.InitUserName> {
  payload: {
    userName: string;
  };
}

export interface InitRepoArgs extends Action<ActionNames.InitRepo> {
  payload: {
    repoName: string;
  };
}

export interface AddRepoFilterStatusArgs
  extends Action<ActionNames.AddRepoFilterStatus> {
  payload: {
    repoName: string;
    filterStep: FilterSteps;
    filterState: RepoFilterState[FilterSteps];
  };
}

export type ActionsType =
  InitUserNameArgs
  | InitRepoArgs
  | AddRepoFilterStatusArgs;
