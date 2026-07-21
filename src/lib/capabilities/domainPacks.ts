import type {
  BuildContract,
  BuildContractRequirement,
} from '@/lib/build-contract';
import {
  CAPABILITY_REGISTRY_VERSION,
  type CapabilityDomainPack,
  type CapabilityDomainPackContribution,
} from './types';

function pack(
  input: Omit<CapabilityDomainPack, 'metadataVersion'>
): CapabilityDomainPack {
  return {
    ...input,
    metadataVersion: CAPABILITY_REGISTRY_VERSION,
  };
}

export const defaultCapabilityDomainPacks: CapabilityDomainPack[] = [
  pack({
    id: 'saas',
    displayName: 'SaaS',
    description: 'Reusable SaaS product planning patterns.',
    matchTags: ['saas', 'subscription', 'dashboard', 'team', 'workspace'],
    suggestedCapabilityIds: [
      'authentication',
      'role-based-access',
      'database',
      'admin-dashboard',
      'billing',
      'subscriptions',
      'analytics',
      'deployment-vercel',
    ],
    domainEntities: ['Workspace', 'User', 'Plan', 'Subscription'],
    acceptanceCriteria: ['Plan and account state are represented safely.'],
    riskChecks: ['Avoid exposing billing secrets in client code.'],
    uxPatterns: ['Dashboard overview', 'Settings area', 'Plan status card'],
    terminology: ['workspace', 'subscription', 'seat', 'plan'],
    recommendations: ['Use role-aware navigation for team apps.'],
  }),
  pack({
    id: 'marketplace',
    displayName: 'Marketplace',
    description: 'Buyer, seller, listing, and transaction patterns.',
    matchTags: ['marketplace', 'seller', 'buyer', 'listing', 'checkout'],
    suggestedCapabilityIds: ['authentication', 'database', 'crud', 'billing', 'search'],
    domainEntities: ['Listing', 'Seller', 'Buyer', 'Order'],
    acceptanceCriteria: ['Listings can be browsed and managed.'],
    riskChecks: ['Payment workflows need guarded server-side handling.'],
    uxPatterns: ['Listing cards', 'Search and filters', 'Seller dashboard'],
    terminology: ['listing', 'seller', 'buyer', 'order'],
    recommendations: ['Keep checkout preparation separate from listing management.'],
  }),
  pack({
    id: 'childrens-story',
    displayName: "Children's Story",
    description: 'Story creation, child profiles, AI writing, and image generation patterns.',
    matchTags: [
      'children',
      "children's",
      'child',
      'kid',
      'kids',
      'story',
      'storybook',
      'illustration',
      'character',
      'parent',
    ],
    suggestedCapabilityIds: [
      'child-profile-management',
      'story-crud',
      'page-editor',
      'image-upload',
      'text-ai-generation',
      'image-ai-generation',
      'character-profile-management',
      'story-library',
      'parental-safety-review',
    ],
    domainEntities: ['ChildProfile', 'Story', 'StoryPage', 'CharacterProfile', 'Illustration'],
    acceptanceCriteria: [
      'Parents can create and review story content before sharing it with children.',
      'Story pages can be edited individually.',
    ],
    riskChecks: [
      'Children-focused content should include parent-visible review controls.',
      'Uploaded photos and generated illustrations need storage and preview handling.',
    ],
    uxPatterns: ['Story library', 'Page-by-page editor', 'Character profile picker'],
    terminology: ['story', 'page', 'child profile', 'character', 'illustration'],
    recommendations: ['Keep AI generation behind explicit user actions and review states.'],
  }),
  pack({
    id: 'content-platform',
    displayName: 'Content Platform',
    description: 'Publishing, editing, media, and library workflows.',
    matchTags: ['content', 'cms', 'blog', 'article', 'media', 'publish'],
    suggestedCapabilityIds: ['database', 'crud', 'rich-editor', 'media-library', 'search'],
    domainEntities: ['Post', 'Page', 'MediaAsset'],
    acceptanceCriteria: ['Content can be drafted, edited, and browsed.'],
    riskChecks: ['Publishing workflows need clear draft and published states.'],
    uxPatterns: ['Editor workspace', 'Media drawer', 'Content list'],
    terminology: ['draft', 'publish', 'asset', 'entry'],
    recommendations: ['Separate editing from public presentation routes.'],
  }),
  pack({
    id: 'crm',
    displayName: 'CRM',
    description: 'Contact, company, task, and pipeline management patterns.',
    matchTags: ['crm', 'contact', 'company', 'pipeline', 'deal', 'follow-up'],
    suggestedCapabilityIds: ['database', 'crud', 'search', 'admin-dashboard', 'notifications'],
    domainEntities: ['Contact', 'Company', 'Task', 'Deal'],
    acceptanceCriteria: ['Contacts and related tasks can be searched and updated.'],
    riskChecks: ['Pipeline state should be explicit and easy to change.'],
    uxPatterns: ['Data tables', 'Status filters', 'Pipeline board'],
    terminology: ['contact', 'company', 'deal', 'pipeline'],
    recommendations: ['Use list filters and quick-edit controls for repeated CRM workflows.'],
  }),
];

function contractSearchText(contract: BuildContract): string {
  return [
    contract.project.projectName,
    contract.projectSummary,
    contract.routes.map((route) => `${route.path} ${route.label} ${route.purpose ?? ''}`).join(' '),
    contract.dataModels.map((model) => `${model.name} ${model.fields.join(' ')}`).join(' '),
    contract.integrations.join(' '),
    contract.aiCapabilities.join(' '),
    contract.acceptanceCriteria.join(' '),
    contract.requirements
      .map((requirement) => `${requirement.title} ${requirement.description}`)
      .join(' '),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function matchesTerm(text: string, term: string): boolean {
  const escaped = term
    .toLowerCase()
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\\ /g, '\\s+');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(text);
}

function matchesChildrenStoryDomain(text: string): boolean {
  const explicitEntitySignals = [
    'childprofile',
    'child profile',
    'characterprofile',
    'character profile',
    'storypage',
    'story page',
  ];
  if (explicitEntitySignals.some((term) => text.includes(term))) return true;

  const childSignals = [
    'children',
    "children's",
    'child',
    'kid',
    'kids',
    'parent',
    'parents',
    'guardian',
    'guardians',
  ];
  const storySignals = [
    'story',
    'stories',
    'storybook',
    'illustration',
    'illustrations',
    'character',
    'characters',
    'page editor',
    'ai story generation',
    'ai image generation',
  ];

  return (
    childSignals.some((term) => matchesTerm(text, term)) &&
    storySignals.some((term) => matchesTerm(text, term))
  );
}

function matchesDomainPack(pack: CapabilityDomainPack, text: string): boolean {
  if (pack.id === 'childrens-story') {
    return matchesChildrenStoryDomain(text);
  }

  return pack.matchTags.some((tag) => matchesTerm(text, tag.toLowerCase()));
}

function sourceRequirementIdsForPack(
  pack: CapabilityDomainPack,
  requirements: BuildContractRequirement[]
): string[] {
  const terms = [...pack.matchTags, ...pack.terminology].map((term) =>
    term.toLowerCase()
  );
  return requirements
    .filter((requirement) => {
      const text = `${requirement.title} ${requirement.description}`.toLowerCase();
      return terms.some((term) => text.includes(term));
    })
    .map((requirement) => requirement.stableId);
}

export function applyDomainPacks(
  contract: BuildContract,
  packs: CapabilityDomainPack[] = defaultCapabilityDomainPacks
): CapabilityDomainPackContribution[] {
  const text = contractSearchText(contract);
  return packs
    .filter((pack) => matchesDomainPack(pack, text))
    .map((pack) => ({
      domainPackId: pack.id,
      capabilityIds: [...pack.suggestedCapabilityIds],
      domainEntities: [...pack.domainEntities],
      acceptanceCriteria: [...pack.acceptanceCriteria],
      riskChecks: [...pack.riskChecks],
      uxPatterns: [...pack.uxPatterns],
      terminology: [...pack.terminology],
      recommendations: [
        ...pack.recommendations,
        ...sourceRequirementIdsForPack(pack, contract.requirements).map(
          (id) => `Related contract requirement: ${id}`
        ),
      ],
    }));
}
