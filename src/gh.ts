import * as Octokit from '@octokit/rest';
import assert = require('assert');
import Bottleneck from 'bottleneck';

import {
  OctokitMod,
  ResponseWithDataArray,
  RepoFromGetUserRepo,
  ResponseFromGetUserRepo,
  RepoNameWithBranchesAndParent,
  RepoNameWithUnusedFlag,
  ObjectWithPerPage,
  ResponseWithDataArrayAndMeta,
  RepoNameWithBranches,
  BranchFromGetBranches,
  ResponseFromGetBranches,
  RepoNameWithParentRepo,
  ResponseFromGetRepo,
  ResponseFromCompareCommits,
  OwnerFromGetContributors,
  ResponseFromGetContributors,
} from './types';
import { createAppStore, ActionsType, ApplicationState, ActionNames, FilterSteps, FilterStatus } from './store';
import { Store } from 'redux';

// +++ General init +++
const octokit = new Octokit() as OctokitMod;

// Add rate limiter
const limiter = new Bottleneck({
  maxConcurrent: 10,
  minTime: 50,
});

const noop = () => Promise.resolve();
octokit.hook.before('request', limiter.schedule.bind(limiter, noop));

// Add key and secret for query
octokit.authenticate({
  type: 'oauth',
  key: '05e5f5ec65387c49137b',
  secret: '2228539a48032f0622d6c12a66f56253d0a30d60',
});
// --- End General init ---

class GithubDetectUnusedRepos {
  private username: string;
  reduxStore: Store<ApplicationState, ActionsType>;

  constructor(username: string) {
    this.username = username;
    this.reduxStore = createAppStore();

    // Update username in redux store
    this.reduxStore.dispatch({
      type: ActionNames.InitUserName,
      payload: {
        userName: username
      }
    });
  }

  public async fetchUnusedForkedRepos() {
    const params: Octokit.ReposGetForUserParams = {
      username: this.username,
    };

    const repos: ResponseWithDataArray<
      RepoFromGetUserRepo
      > = await this.paginate(
        (
          tmpFirstParam: Octokit.ReposGetForUserParams
        ): Promise<ResponseFromGetUserRepo> => {
          return (octokit.repos.getForUser(tmpFirstParam) as any) as Promise<
            ResponseFromGetUserRepo
            >;
        },
        params
      );

    // Update all repo names in redux store
    repos.data.forEach(repoData => {
      this.reduxStore.dispatch({
        type: ActionNames.InitRepo,
        payload: {
          repoName: repoData.name
        }
      })
    });

    const forkedRepoNames = repos.data
      .filter(repo => repo.fork)
      .map(repo => repo.name);

    // tslint:disable-next-line:no-console
    console.log(forkedRepoNames);

    // Update fork filter in redux store
    repos.data.forEach(repoData => {
      if (forkedRepoNames.includes(repoData.name)) {

        this.reduxStore.dispatch({
          type: ActionNames.AddRepoFilterStatus,
          payload: {
            repoName: repoData.name,
            filterStep: FilterSteps.forked,
            filterState: {
              status: FilterStatus.pass
            }
          }
        });

      } else {
        this.reduxStore.dispatch({
          type: ActionNames.AddRepoFilterStatus,
          payload: {
            repoName: repoData.name,
            filterStep: FilterSteps.forked,
            filterState: {
              status: FilterStatus.fail
            }
          }
        });
      }
    });

    const allPromiseRepoNameWithBranches = forkedRepoNames.map(repoName => {
      return this.fetchRepoNameWithBranches(repoName);
    });

    const allPromiseRepoNameWithParentRepo = forkedRepoNames.map(
      forkedRepoName => {
        return this.fetchRepoNameWithParentRepo(forkedRepoName);
      }
    );

    const allRepoNameWithBranches = await Promise.all(
      allPromiseRepoNameWithBranches
    );
    const allRepoNameWithParentRepo = await Promise.all(
      allPromiseRepoNameWithParentRepo
    );

    // Both the above list (of objects) have same number of items and
    // items in the same index (of both lists) have same value for repoName key.

    // So join them together into one list of objects (each object containing branches and parent repo)

    assert.strictEqual(
      allRepoNameWithBranches.length,
      allRepoNameWithParentRepo.length,
      'Length of `allRepoNameWithBranches` and `allRepoNameWithParentRepo` should be same'
    );

    const allRepoNameWithBranchesAndParent: RepoNameWithBranchesAndParent[] = [];
    {
      const tmpLength = allRepoNameWithBranches.length;

      for (let index = 0; index < tmpLength; index++) {
        const tmpRepoNameWithBranches = allRepoNameWithBranches[index];
        const tmpRepoNameWithParentRepo = allRepoNameWithParentRepo[index];

        assert.strictEqual(
          tmpRepoNameWithBranches.repoName,
          tmpRepoNameWithParentRepo.repoName,
          'Reponame should be same for objects stored at same index in `allRepoNameWithBranches` and `allRepoNameWithParentRepo`'
        );

        const repoName = tmpRepoNameWithBranches.repoName;

        const combinedObject: RepoNameWithBranchesAndParent = {
          repoName,
          branches: tmpRepoNameWithBranches.branches,
          parentRepo: tmpRepoNameWithParentRepo.parentRepo,
        };

        allRepoNameWithBranchesAndParent.push(combinedObject);
      }
    }

    const allRepoWithFlagTillStep4: RepoNameWithUnusedFlag[] = [];

    {
      const allPromiseRepoWithFlagFromCommit = allRepoNameWithBranchesAndParent.map(
        (repoInfo: RepoNameWithBranchesAndParent) => {
          return this.fetchNoneOfForkBranchesIsAhead(repoInfo);
        }
      );

      const allPromiseRepoWithFlagFromForkContrib = allRepoNameWithBranchesAndParent.map(
        ({ repoName }) => {
          return this.fetchUserIsNotContributor(this.username, repoName);
        }
      );

      const allPromiseRepoWithFlagFromParentContrib = allRepoNameWithBranchesAndParent.map(
        ({ repoName, parentRepo }) => {
          return this.fetchUserIsNotContributor(
            parentRepo.owner.login,
            repoName
          );
        }
      );

      const allRepoWithFlagFromCommitAhead: RepoNameWithUnusedFlag[] = await Promise.all(
        allPromiseRepoWithFlagFromCommit
      );

      const allRepoWithFlagFromForkContrib: RepoNameWithUnusedFlag[] = await Promise.all(
        allPromiseRepoWithFlagFromForkContrib
      );

      const allRepoWithFlagFromParentContrib: RepoNameWithUnusedFlag[] = await Promise.all(
        allPromiseRepoWithFlagFromParentContrib
      );

      {
        // Update redux state for these 3 filters
        allRepoWithFlagFromCommitAhead.forEach(tmp => {
          this.reduxStore.dispatch(
            {
              type: ActionNames.AddRepoFilterStatus,
              payload:{
                repoName: tmp.repoName,
                filterStep: FilterSteps.eachBranchBehindOrEven,
                filterState:{
                  status: tmp.unused ? FilterStatus.pass : FilterStatus.fail
                }
              }
            }
          )
        });

        allRepoWithFlagFromForkContrib.forEach(tmp => {
          this.reduxStore.dispatch(
            {
              type: ActionNames.AddRepoFilterStatus,
              payload:{
                repoName: tmp.repoName,
                filterStep: FilterSteps.notForkContributor,
                filterState:{
                  status: tmp.unused ? FilterStatus.pass : FilterStatus.fail
                }
              }
            }
          )
        });

        allRepoWithFlagFromParentContrib.forEach(tmp => {
          this.reduxStore.dispatch(
            {
              type: ActionNames.AddRepoFilterStatus,
              payload:{
                repoName: tmp.repoName,
                filterStep: FilterSteps.notParentContributor,
                filterState:{
                  status: tmp.unused ? FilterStatus.pass : FilterStatus.fail
                }
              }
            }
          )
        });
      }

      {
        assert.strictEqual(
          allRepoWithFlagFromCommitAhead.length,
          allRepoWithFlagFromForkContrib.length,
          'Length of `allRepoWithFlagFromCommit` and `allRepoWithFlagFromContrib` should be same'
        );

        const repoCount = allRepoWithFlagFromCommitAhead.length;

        for (let index = 0; index < repoCount; index++) {
          const tmpObjFromCommitAhead = allRepoWithFlagFromCommitAhead[index];
          const tmpObjFromForkContrib = allRepoWithFlagFromForkContrib[index];
          const tmpObjFromParentContrib =
            allRepoWithFlagFromParentContrib[index];

          assert.strictEqual(
            tmpObjFromCommitAhead.repoName,
            tmpObjFromForkContrib.repoName,
            'Reponame from same index of `allRepoWithFlagFromCommit` and `allRepoWithFlagFromContrib` should be same'
          );

          assert.strictEqual(
            tmpObjFromForkContrib.repoName,
            tmpObjFromParentContrib.repoName,
            'Reponame from same index of `tmpObjFromForkContrib` and `tmpObjFromParentContrib` should be same'
          );

          const tmpRepoName = tmpObjFromCommitAhead.repoName;

          allRepoWithFlagTillStep4.push({
            repoName: tmpRepoName,
            unused:
              tmpObjFromCommitAhead.unused &&
              tmpObjFromForkContrib.unused &&
              tmpObjFromParentContrib.unused,
          });
        }
      }
    }

    const unusedRepoNames = allRepoWithFlagTillStep4
      .filter(tmp => tmp.unused)
      .map(tmp => tmp.repoName);

    return unusedRepoNames;
  }

  private async paginate<TFirstParam extends ObjectWithPerPage, TDataElement>(
    method: (
      args: TFirstParam
    ) => Promise<ResponseWithDataArrayAndMeta<TDataElement>>,
    args: TFirstParam
  ): Promise<ResponseWithDataArray<TDataElement>> {
    // Set per_page
    args.per_page = 100;

    let response: ResponseWithDataArrayAndMeta<TDataElement> = await method(
      args
    );

    // Concat all data
    let { data } = response;
    while (octokit.hasNextPage(response)) {
      response = await octokit.getNextPage(response);
      data = data.concat(response.data);
    }

    return {
      data,
    };
  }

  private async fetchRepoNameWithBranches(
    repoName: string
  ): Promise<RepoNameWithBranches> {
    const params: Octokit.ReposGetBranchesParams = {
      owner: this.username,
      repo: repoName,
    };

    const branchesResponse: ResponseWithDataArray<
      BranchFromGetBranches
      > = await this.paginate(
        (
          tmpFirstParam: Octokit.ReposGetBranchesParams
        ): Promise<ResponseFromGetBranches> => {
          return (octokit.repos.getBranches(tmpFirstParam) as any) as Promise<
            ResponseFromGetBranches
            >;
        },
        params
      );

    return {
      repoName,
      branches: branchesResponse.data,
    };
  }

  private async fetchRepoNameWithParentRepo(
    forkedRepoName: string
  ): Promise<RepoNameWithParentRepo> {
    const responseRepoDetails: ResponseFromGetRepo = await octokit.repos.get({
      owner: this.username,
      repo: forkedRepoName,
    });

    const repoDetails = responseRepoDetails.data;

    return {
      repoName: forkedRepoName,
      parentRepo: repoDetails.parent,
    };
  }

  private async fetchForkBranchIsNotAhead(
    parentRepoOwner: string,
    parentRepoName: string,
    forkedRepoOwner: string,
    forkedRepoName: string,
    forkedBranchName: string,
    parentBranchName?: string
  ): Promise<boolean> {
    let commitObject: ResponseFromCompareCommits;

    if (parentBranchName === undefined) {
      parentBranchName = forkedBranchName;
    }

    try {
      commitObject = ((await octokit.repos.compareCommits({
        // both owner and repo can be either parent or forked, for this usecase
        owner: parentRepoOwner,
        repo: parentRepoName,
        base: `${parentRepoOwner}:${parentBranchName}`,
        head: `${forkedRepoOwner}:${forkedBranchName}`,
      })) as any) as ResponseFromCompareCommits;
    } catch {
      const fallBackParentBranchName = 'master';

      if (parentBranchName !== fallBackParentBranchName) {
        return this.fetchForkBranchIsNotAhead(
          parentRepoOwner,
          parentRepoName,
          forkedRepoOwner,
          forkedRepoName,
          forkedBranchName,
          fallBackParentBranchName
        );
      } else {
        return false;
      }
    }

    if (commitObject.data.ahead_by === 0) {
      return true;
    } else {
      return false;
    }
  }

  // Async determine if parent repo contains all commits which are
  // currently set as HEAD in each branch of the original repo
  private async fetchNoneOfForkBranchesIsAhead(
    repoInfo: RepoNameWithBranchesAndParent
  ): Promise<RepoNameWithUnusedFlag> {
    const allPromiseBranchUnused = repoInfo.branches.map(tmpBranch => {
      return this.fetchForkBranchIsNotAhead(
        repoInfo.parentRepo.owner.login,
        repoInfo.parentRepo.name,
        this.username,
        repoInfo.repoName,
        tmpBranch.name
      );
    });

    const allBranchUnused = await Promise.all(allPromiseBranchUnused);

    const everyBranchUnused = allBranchUnused.every(
      tmpBoolean => tmpBoolean === true
    );

    return {
      repoName: repoInfo.repoName,
      unused: everyBranchUnused,
    };
  }

  private async fetchUserIsNotContributor(
    repoOwner: string,
    repoName: string
  ): Promise<RepoNameWithUnusedFlag> {
    const params: Octokit.ReposGetContributorsParams = {
      owner: repoOwner,
      repo: repoName,
      anon: '0',
    };

    const responseFromGetContributors: ResponseWithDataArray<
      OwnerFromGetContributors
      > = await this.paginate(
        async (
          tmpFirstParam: Octokit.ReposGetContributorsParams
        ): Promise<ResponseWithDataArrayAndMeta<OwnerFromGetContributors>> => {
          // Modify getContributors to return empty contributor data array instead of undefined for empty repos
          const response = await ((octokit.repos.getContributors(
            tmpFirstParam
          ) as any) as Promise<ResponseFromGetContributors>);

          let dataNormalized = response.data;
          if (dataNormalized === undefined) {
            dataNormalized = [];
          }

          const responseNormalized: ResponseWithDataArrayAndMeta<
            OwnerFromGetContributors
            > = {
            data: dataNormalized,
            meta: response.meta,
          };

          return responseNormalized;
        },
        params
      );

    const contributors = responseFromGetContributors.data;

    const matchingContributor = contributors.find(
      tmpContributor => tmpContributor.login === this.username
    );

    return {
      // tslint:disable-next-line:object-literal-shorthand
      repoName: repoName,
      unused: matchingContributor === undefined,
    };
  }
}

export function runMain(username: string = 'bendtherules') {
  new GithubDetectUnusedRepos(username)
    .fetchUnusedForkedRepos()
    .then(unusedRepoNames => {
      // tslint:disable-next-line:no-console
      console.log(unusedRepoNames);
    });
}

// Next steps
//
// 1. Get all forked repos for a user
// https://developer.github.com/v3/repos/#list-user-repositories
// https://octokit.github.io/rest.js/#api-Repos-getForUser
//
// 1.a. Also get (forked) repo's parent repo
//
// 2. For each forked repo, list all branches
// https://developer.github.com/v3/repos/branches/#list-branches
// https://octokit.github.io/rest.js/#api-Repos-getBranches
// Last commit sha is present in this object
//
// 3. Compare each branch in the forked repo to same branch in parent repo, and check if the fork one is ahead of the parent {Should not be}
// https://developer.github.com/v3/repos/commits/#compare-two-commits
// https://octokit.github.io/rest.js/#api-Repos-compareCommits
//
// 4. Then check if user is in contributor list (of either parent or forked repo) {Should not be present in either of them}
// https://developer.github.com/v3/repos/#list-contributors
// https://octokit.github.io/rest.js/#api-Repos-getContributors
//
// 5. If not contributor, list commits on a repo filtered by author and check that its empty- for both parent and fork [Should be empty]
// https://developer.github.com/v3/repos/commits/#list-commits-on-a-repository
//
// 6. Show marked repo names for review
//
// 7. Delete those repos
// https://developer.github.com/v3/repos/#delete-a-repository
// https://octokit.github.io/rest.js/#api-Repos-delete
