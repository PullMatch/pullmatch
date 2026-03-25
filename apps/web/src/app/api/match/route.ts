import { NextRequest, NextResponse } from 'next/server';
import { fetchPRFiles, buildContributorGraph, matchReviewers } from '@pullmatch/shared';
import type { ReviewerRecommendation } from '@pullmatch/shared';

interface MatchRequest {
  owner: string;
  repo: string;
  prNumber: number;
  author?: string;
}

interface MatchResponse {
  recommendations: ReviewerRecommendation[];
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

  const token = process.env.GITHUB_TOKEN;

  try {
    const files = await fetchPRFiles(owner, repo, prNumber, token);
    const filenames = files.map((f) => f.filename);
    const graph = await buildContributorGraph(owner, repo, filenames, token);
    const recommendations = matchReviewers(graph, author);

    const response: MatchResponse = {
      recommendations,
      filesAnalyzed: filenames.length,
    };
    return NextResponse.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
