import { Reducer, createStore, Store } from 'redux';
import { devToolsEnhancer } from 'redux-devtools-extension';

import { ApplicationState, FilterStatus, RepoFilterState } from './model';
import {
  ActionNames,
  InitUserNameArgs,
  InitRepoArgs,
  AddRepoFilterStatusArgs,
  ActionsType,
} from './actions';

export const initialState: ApplicationState = {
  username: '',
  repoStateMap: new Map(),
};

export const reducer: Reducer<ApplicationState, ActionsType> = (
  state: ApplicationState = initialState,
  action
) => {
  // We'll augment the action type on the switch case to make sure we have
  // all the cases handled.
  switch (action.type) {
    case ActionNames.InitUserName:
      return { ...state, username: action.payload.userName };

    case ActionNames.InitRepo: {
      const clonedAppState = new Map(state.repoStateMap);
      clonedAppState.set(action.payload.repoName, {
        filterState: {
          forked: {
            status: FilterStatus.waiting,
          },
          eachBranchBehindOrEven: {
            status: FilterStatus.waiting,
          },
          notForkContributor: {
            status: FilterStatus.waiting,
          },
          notParentContributor: {
            status: FilterStatus.waiting,
          },
          noCommits: {
            status: FilterStatus.waiting,
          },
        },
      });
      return { ...state, repoStateMap: clonedAppState };
    }
    case ActionNames.AddRepoFilterStatus: {
      const clonedAppState = new Map(state.repoStateMap);
      let clonedRepoState = JSON.parse(
        JSON.stringify(clonedAppState.get(action.payload.repoName))
      ) as
        | {
            filterState: RepoFilterState;
          }
        | undefined;

      if (clonedRepoState !== undefined) {
        clonedRepoState.filterState[action.payload.filterStep] =
          action.payload.filterState;

        clonedAppState.set(action.payload.repoName, clonedRepoState);
        return { ...state, repoStateMap: clonedAppState };
      } else {
        return state;
      }
    }
    default:
      return state;
  }
};

export function createAppStore(): Store<ApplicationState, ActionsType> {
  return (createStore<ApplicationState, ActionsType, {}, {}>(
    reducer,
    initialState,
    devToolsEnhancer({
      serialize: true,
    })
  ) as any) as Store<ApplicationState, ActionsType>;
}
