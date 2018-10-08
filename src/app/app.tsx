import * as React from "react";
import { connect, Provider } from 'react-redux';
import ReactTable from "react-table";

import 'react-table/react-table.css';

import { runMain, defaultStore } from '../core/gh';
import { ApplicationState, RepoFilterStateMap, FilterSteps } from "../core/store";

export type AppPropTypes = { repoStateMap: RepoFilterStateMap };

export class App extends React.Component<AppPropTypes, { username: string | undefined }> {
  constructor(props: AppPropTypes) {
    super(props);

    this.state = {
      username: '',
    }
  }

  handleUsernameSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    runMain(this.state.username);
  }

  handleUsernameChange = (ev: React.FormEvent<HTMLInputElement>) => {
    this.setState({
      username: ev.currentTarget.value,
    });
  }

  render() {
    const data = [...this.props.repoStateMap.keys()].map(
      (key) => ({
        repoName: key,
        ...this.props.repoStateMap.get(key)
      })
    );

    const columns = [
      {
        Header: "Repo Name",
        accessor: `repoName`
      },
      {
        Header: FilterSteps.forked,
        accessor: `filterState.${FilterSteps.forked}.status`
      }, {
        Header: FilterSteps.eachBranchBehindOrEven,
        accessor: `filterState.${FilterSteps.eachBranchBehindOrEven}.status`
      }, {
        Header: FilterSteps.notForkContributor,
        accessor: `filterState.${FilterSteps.notForkContributor}.status`
      }, {
        Header: FilterSteps.notParentContributor,
        accessor: `filterState.${FilterSteps.notParentContributor}.status`
      }, {
        Header: FilterSteps.noCommits,
        accessor: `filterState.${FilterSteps.noCommits}.status`
      },
    ];

    return (
      <div>
        <form onSubmit={this.handleUsernameSubmit}>
          <label>
            Name:
        <input type="text" value={this.state.username} onChange={this.handleUsernameChange} />
          </label>
        </form >

        <ReactTable
          data={data}
          columns={columns}
        />
      </div>
    );
  }
}

function mapStateToProps(state: ApplicationState): AppPropTypes {
  return {
    repoStateMap: state.repoStateMap,
  };
}

const ConnectedApp = connect<AppPropTypes, {}, {}, ApplicationState>(mapStateToProps)(App);

export default (() => <Provider store={defaultStore}><ConnectedApp /></Provider>);
