import * as Octokit from '@octokit/rest';
import assert = require('assert');
import Bottleneck from 'bottleneck';

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

interface RequestOptions {
  method: string;
  url: string;
  headers: any;
  query?: string;
  variables?: Variables;
}

interface Result {
  headers: {
    status: string;
  };
}

interface OctokitError {
  code: number;
  status: string;
}

interface OctokitMod extends Octokit {
  // The following are added because Octokit does not expose the hook.error, hook.before, and hook.after methods
  hook: {
    error: (
      when: 'request',
      callback: (error: OctokitError, options: RequestOptions) => void
    ) => void;
    before: (
      when: 'request',
      callback: (result: Result, options: RequestOptions) => void
    ) => void;
    after: (
      when: 'request',
      callback: (result: Result, options: RequestOptions) => void
    ) => void;
  };
}

interface Variables {
  [key: string]: any;
}

interface ResponseWithDataArray<T> {
  data: T[];
}

interface ResponseWithMetaLink {
  meta: {
    link: string;
  };
}

interface ResponseWithDataArrayAndMeta<T>
  extends ResponseWithDataArray<T>,
    ResponseWithMetaLink {}

interface ResponseFromGetUserRepo extends ResponseWithMetaLink {
  data: RepoFromGetUserRepo[];
}

interface ResponseFromGetBranches extends ResponseWithMetaLink {
  data: BranchFromGetBranches[];
}

interface ResponseFromGetRepo {
  data: RepoFromGetRepo;
  meta: {};
}

interface ResponseFromCompareCommits {
  data: {
    status: string;
    ahead_by: number;
    behind_by: number;
    total_commits: number;
  };
}

interface ResponseFromGetContributors extends ResponseWithMetaLink {
  data: OwnerFromGetContributors[] | undefined;
}

interface RepoFromGetUserRepo {
  default_branch: string;
  description: string;
  fork: boolean;
  full_name: string;
  homepage: string;
  id: number;
  language: string;
  name: string;
  owner: OwnerFromGetUserRepo;
  private: boolean;
  pushed_at: string;
  url: string;
}

interface OwnerFromGetUserRepo {
  avatar_url: string;
  gravatar_id: string;
  html_url: string;
  id: number;
  login: string;
  repos_url: string;
  type: UserType;
}

type OwnerFromGetContributors = OwnerFromGetUserRepo;

enum UserType {
  User = 'User',
}

interface BranchFromGetBranches {
  name: string;
  commit: CommitFromGetBranches;
}

interface CommitFromGetBranches {
  sha: string;
  url: string;
}

interface RepoFromGetRepo {
  parent: RepoFromGetUserRepo;
}

interface RepoNameWithUnusedFlag {
  repoName: string;
  unused: boolean;
}

interface RepoNameWithBranches {
  repoName: string;
  branches: BranchFromGetBranches[];
}

interface RepoNameWithParentRepo {
  repoName: string;
  parentRepo: RepoFromGetUserRepo;
}

interface RepoNameWithBranchesAndParent
  extends RepoNameWithBranches,
    RepoNameWithParentRepo {}

const username = 'rousan';

interface ObjectWithPerPage {
  per_page?: number;
}

async function paginate<TFirstParam extends ObjectWithPerPage, TDataElement>(
  method: (
    args: TFirstParam
  ) => Promise<ResponseWithDataArrayAndMeta<TDataElement>>,
  args: TFirstParam
): Promise<ResponseWithDataArray<TDataElement>> {
  // Set per_page
  args.per_page = 100;

  let response: ResponseWithDataArrayAndMeta<TDataElement> = await method(args);

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

async function fetchRepoNameWithBranches(
  repoName: string
): Promise<RepoNameWithBranches> {
  const params: Octokit.ReposGetBranchesParams = {
    owner: username,
    repo: repoName,
  };

  const branchesResponse: ResponseWithDataArray<
    BranchFromGetBranches
  > = await paginate((tmpFirstParam: Octokit.ReposGetBranchesParams): Promise<
    ResponseFromGetBranches
  > => {
    return (octokit.repos.getBranches(tmpFirstParam) as any) as Promise<
      ResponseFromGetBranches
    >;
  }, params);

  return {
    repoName,
    branches: branchesResponse.data,
  };
}

async function fetchRepoNameWithParentRepo(
  forkedRepoName: string
): Promise<RepoNameWithParentRepo> {
  const responseRepoDetails: ResponseFromGetRepo = await octokit.repos.get({
    owner: username,
    repo: forkedRepoName,
  });

  const repoDetails = responseRepoDetails.data;

  return {
    repoName: forkedRepoName,
    parentRepo: repoDetails.parent,
  };
}

async function fetchForkBranchIsNotAhead(
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
      return fetchForkBranchIsNotAhead(
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
async function fetchNoneOfForkBranchesIsAhead(
  repoInfo: RepoNameWithBranchesAndParent
): Promise<RepoNameWithUnusedFlag> {
  const allPromiseBranchUnused = repoInfo.branches.map(tmpBranch => {
    return fetchForkBranchIsNotAhead(
      repoInfo.parentRepo.owner.login,
      repoInfo.parentRepo.name,
      username,
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

async function fetchUserIsNotContributor(
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
  > = await paginate(
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
    tmpContributor => tmpContributor.login === username
  );

  return {
    // tslint:disable-next-line:object-literal-shorthand
    repoName: repoName,
    unused: matchingContributor === undefined,
  };
}

async function fetchUnusedForkedRepos() {
  const params: Octokit.ReposGetForUserParams = {
    username,
  };

  const repos: ResponseWithDataArray<RepoFromGetUserRepo> = await paginate(
    (
      tmpFirstParam: Octokit.ReposGetForUserParams
    ): Promise<ResponseFromGetUserRepo> => {
      return (octokit.repos.getForUser(tmpFirstParam) as any) as Promise<
        ResponseFromGetUserRepo
      >;
    },
    params
  );

  const forkedRepoNames = repos.data
    .filter(repo => repo.fork)
    .map(repo => repo.name);

  // tslint:disable-next-line:no-console
  console.log(forkedRepoNames);

  const allPromiseRepoNameWithBranches = forkedRepoNames.map(repoName => {
    return fetchRepoNameWithBranches(repoName);
  });

  const allPromiseRepoNameWithParentRepo = forkedRepoNames.map(
    forkedRepoName => {
      return fetchRepoNameWithParentRepo(forkedRepoName);
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
        return fetchNoneOfForkBranchesIsAhead(repoInfo);
      }
    );

    const allPromiseRepoWithFlagFromForkContrib = allRepoNameWithBranchesAndParent.map(
      ({ repoName }) => {
        return fetchUserIsNotContributor(username, repoName);
      }
    );

    const allPromiseRepoWithFlagFromParentContrib = allRepoNameWithBranchesAndParent.map(
      ({ repoName, parentRepo }) => {
        return fetchUserIsNotContributor(parentRepo.owner.login, repoName);
      }
    );

    const allRepoWithFlagFromCommit: RepoNameWithUnusedFlag[] = await Promise.all(
      allPromiseRepoWithFlagFromCommit
    );

    const allRepoWithFlagFromForkContrib: RepoNameWithUnusedFlag[] = await Promise.all(
      allPromiseRepoWithFlagFromForkContrib
    );

    const allRepoWithFlagFromParentContrib: RepoNameWithUnusedFlag[] = await Promise.all(
      allPromiseRepoWithFlagFromParentContrib
    );

    {
      assert.strictEqual(
        allRepoWithFlagFromCommit.length,
        allRepoWithFlagFromForkContrib.length,
        'Length of `allRepoWithFlagFromCommit` and `allRepoWithFlagFromContrib` should be same'
      );

      const repoCount = allRepoWithFlagFromCommit.length;

      for (let index = 0; index < repoCount; index++) {
        const tmpObjFromCommit = allRepoWithFlagFromCommit[index];
        const tmpObjFromForkContrib = allRepoWithFlagFromForkContrib[index];
        const tmpObjFromParentContrib = allRepoWithFlagFromParentContrib[index];

        assert.strictEqual(
          tmpObjFromCommit.repoName,
          tmpObjFromForkContrib.repoName,
          'Reponame from same index of `allRepoWithFlagFromCommit` and `allRepoWithFlagFromContrib` should be same'
        );

        assert.strictEqual(
          tmpObjFromForkContrib.repoName,
          tmpObjFromParentContrib.repoName,
          'Reponame from same index of `tmpObjFromForkContrib` and `tmpObjFromParentContrib` should be same'
        );

        const tmpRepoName = tmpObjFromCommit.repoName;

        allRepoWithFlagTillStep4.push({
          repoName: tmpRepoName,
          unused:
            tmpObjFromCommit.unused &&
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

fetchUnusedForkedRepos().then(unusedRepoNames => {
  // tslint:disable-next-line:no-console
  console.log(unusedRepoNames);
});

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
// 4. If parent contains, then check if user is in contributor list (of either parent or forked repo) {Should not be present in either of them}
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
