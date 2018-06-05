import rest = require('@octokit/rest');
import assert = require('assert');

const octokit = new rest();
octokit.authenticate({
  type: 'oauth',
  key: '05e5f5ec65387c49137b',
  secret: '2228539a48032f0622d6c12a66f56253d0a30d60',
});

interface ResponseWithDataArray<T> {
  data: T[];
}

interface ResponseWithMetaLink {
  meta: {
    link: string
  };
}

interface ResponseWithPaginationAndMeta<T> extends ResponseWithDataArray<T>, ResponseWithMetaLink {

}

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

interface ResponseFromGetContributors {
  data: OwnerFromGetContributors[] | undefined;
  meta: {};
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
  RepoNameWithParentRepo { }

const username = 'bendtherules';

interface ObjectWithPerPage {
  per_page?: number;
}

async function paginate<TFirstParam extends ObjectWithPerPage, TDataElement>(
  method: (args: TFirstParam) => ResponseWithPaginationAndMeta<TDataElement>,
  args: TFirstParam
): Promise<ResponseWithDataArray<TDataElement>> {

  // Set per_page
  args.per_page = 100;

  let response: ResponseWithPaginationAndMeta<TDataElement> = await method(args);

  // Concat all data
  let { data } = response;
  while (octokit.hasNextPage(response)) {
    response = await octokit.getNextPage(response);
    data = data.concat(response.data);
  }

  return {
    data
  };
}

async function fetchRepoNameWithBranches(
  repoName: string
): Promise<RepoNameWithBranches> {
  const params: rest.ReposGetBranchesParams = {
    owner: username,
    repo: repoName,
  };

  const branchesResponse: ResponseWithDataArray<BranchFromGetBranches> =
    await paginate(
      (tmpFirstParam: rest.ReposGetBranchesParams): ResponseFromGetBranches => {
        return octokit.repos.getBranches(tmpFirstParam) as any as ResponseFromGetBranches;
      },
      params
    );

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
  repoName: string
): Promise<RepoNameWithUnusedFlag> {
  const responseFromGetContributors: ResponseFromGetContributors = ((await octokit.repos.getContributors(
    {
      owner: username,
      repo: repoName,
      anon: '0',
      per_page: 100,
      page: 1,
    }
  )) as any) as ResponseFromGetContributors;

  let contributors = responseFromGetContributors.data;

  if (contributors === undefined) {
    contributors = [];
  }

  const foundContributor = contributors.find(
    tmpContributor => tmpContributor.login === username
  );

  return {
    // tslint:disable-next-line:object-literal-shorthand
    repoName: repoName,
    unused: foundContributor === undefined,
  };
}

async function fetchUnusedForkedRepos() {
  const params: rest.ReposGetForUserParams = {
    username,
  }

  const repos: ResponseWithDataArray<RepoFromGetUserRepo> =
    await paginate(
      (tmpFirstParam: rest.ReposGetForUserParams): ResponseFromGetUserRepo => {
        return octokit.repos.getForUser(tmpFirstParam) as any as ResponseFromGetUserRepo;
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

  const allRepoWithFlagMerged: RepoNameWithUnusedFlag[] = [];

  {
    const allPromiseRepoWithFlagFromCommit = allRepoNameWithBranchesAndParent.map(
      (repoInfo: RepoNameWithBranchesAndParent) => {
        return fetchNoneOfForkBranchesIsAhead(repoInfo);
      }
    );

    const allPromiseRepoWithFlagFromContrib = allRepoNameWithBranchesAndParent.map(
      ({ repoName }) => {
        return fetchUserIsNotContributor(repoName);
      }
    );

    const allRepoWithFlagFromCommit: RepoNameWithUnusedFlag[] = await Promise.all(
      allPromiseRepoWithFlagFromCommit
    );

    const allRepoWithFlagFromContrib: RepoNameWithUnusedFlag[] = await Promise.all(
      allPromiseRepoWithFlagFromContrib
    );

    {
      assert.strictEqual(
        allRepoWithFlagFromCommit.length,
        allRepoWithFlagFromContrib.length,
        'Length of `allRepoWithFlagFromCommit` and `allRepoWithFlagFromContrib` should be same'
      );

      const repoCount = allRepoWithFlagFromCommit.length;

      for (let index = 0; index < repoCount; index++) {
        const tmpObjFromCommit = allRepoWithFlagFromCommit[index];
        const tmpObjFromContrib = allRepoWithFlagFromContrib[index];

        assert.strictEqual(
          tmpObjFromCommit.repoName,
          tmpObjFromContrib.repoName,
          'Reponame from same index of `allRepoWithFlagFromCommit` and `allRepoWithFlagFromContrib` should be same'
        );

        const tmpRepoName = tmpObjFromCommit.repoName;

        allRepoWithFlagMerged.push({
          repoName: tmpRepoName,
          unused: tmpObjFromCommit.unused && tmpObjFromContrib.unused,
        });
      }
    }
  }

  const unusedRepoNames = allRepoWithFlagMerged
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
// 4. If parent contains, then check if user is in contributor list (of forked repo) {Should not contain}
// https://developer.github.com/v3/repos/#list-contributors
// https://octokit.github.io/rest.js/#api-Repos-getContributors
//
// 5. Show marked repo names for review
//
// 6. Delete those repos
// https://developer.github.com/v3/repos/#delete-a-repository
// https://octokit.github.io/rest.js/#api-Repos-delete
