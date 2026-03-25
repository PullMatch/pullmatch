import { NextRequest, NextResponse } from 'next/server';
import { fetchPRFiles, buildContributorGraph, matchReviewers } from '@pullmatch/shared';

const MIN_REVIEWERS = 3;

interface MatchRequest {
  owner: string;
  repo: string;
  prNumber: number;
  author?: string;
}

interface Reviewer {
  username: string;
  score: number;
  reasons: string[];
}

interface MatchResponse {
  reviewers: Reviewer[];
  filesAnalyzed: number;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: MatchRequest;
  try {
    body = await req.json() as MatchRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { owner, repo, prNumber, author = '' } = body;
  if (!owner || !repo || !prNumber) {
    return NextResponse.json(
      { error: 'Missing required fields: owner, repo, prNumber' },
      { status: 400 }
    );
  }

  const token = process.env.GITHUB_TOKEN_WRITE;
  if (!token) {
    return NextResponse.json(
      { error: 'GITHUB_TOKEN_WRITE is not set — cannot fetch live GitHub data' },
      { status: 500 }
    );
  }

  try {
    console.debug(`[match] fetching PR files for ${owner}/${repo}#${prNumber}`);
    const files = await fetchPRFiles(owner, repo, prNumber, token);
    const filenames = files.map((f) => f.filename);
    console.debug(`[match] analyzing ${filenames.length} file(s)`);

    const graph = await buildContributorGraph(owner, repo, filenames, token);
    console.debug(`[match] found ${graph.size} candidate reviewer(s)`);

    const recommendations = matchReviewers(graph, author, MIN_REVIEWERS);
    const reviewers: Reviewer[] = recommendations.map((r) => ({
      username: r.login,
      score: r.score,
      reasons: r.reasons,
    }));

    const response: MatchResponse = {
      reviewers,
      filesAnalyzed: filenames.length,
    };
    return NextResponse.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[match] GitHub API error: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
