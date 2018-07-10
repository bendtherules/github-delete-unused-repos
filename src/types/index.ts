import * as Octokit from '@octokit/rest';

// +++ All typescript definitions +++
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
export interface OctokitMod extends Octokit {
    // The following are added because Octokit does not expose the hook.error, hook.before, and hook.after methods
    hook: {
        error: (when: 'request', callback: (error: OctokitError, options: RequestOptions) => void) => void;
        before: (when: 'request', callback: (result: Result, options: RequestOptions) => void) => void;
        after: (when: 'request', callback: (result: Result, options: RequestOptions) => void) => void;
    };
}
interface Variables {
    [key: string]: any;
}
export interface ResponseWithDataArray<T> {
    data: T[];
}
interface ResponseWithMetaLink {
    meta: {
        link: string;
    };
}
export interface ResponseWithDataArrayAndMeta<T> extends ResponseWithDataArray<T>, ResponseWithMetaLink {
}
export interface ResponseFromGetUserRepo extends ResponseWithMetaLink {
    data: RepoFromGetUserRepo[];
}
export interface ResponseFromGetBranches extends ResponseWithMetaLink {
    data: BranchFromGetBranches[];
}
export interface ResponseFromGetRepo {
    data: RepoFromGetRepo;
    meta: {};
}
export interface ResponseFromCompareCommits {
    data: {
        status: string;
        ahead_by: number;
        behind_by: number;
        total_commits: number;
    };
}
export interface ResponseFromGetContributors extends ResponseWithMetaLink {
    data: OwnerFromGetContributors[] | undefined;
}
export interface RepoFromGetUserRepo {
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
export type OwnerFromGetContributors = OwnerFromGetUserRepo;
enum UserType {
    User = 'User'
}
export interface BranchFromGetBranches {
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
export interface RepoNameWithUnusedFlag {
    repoName: string;
    unused: boolean;
}
export interface RepoNameWithBranches {
    repoName: string;
    branches: BranchFromGetBranches[];
}
export interface RepoNameWithParentRepo {
    repoName: string;
    parentRepo: RepoFromGetUserRepo;
}
export interface RepoNameWithBranchesAndParent extends RepoNameWithBranches, RepoNameWithParentRepo {
}
export interface ObjectWithPerPage {
    per_page?: number;
}
  // --- End all typescript definitions ---