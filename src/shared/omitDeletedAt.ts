type SoftDeletable = { deletedAt?: Date | null };

export const omitDeletedAt = <T extends SoftDeletable>(
    entity: T | null | undefined
): Omit<T, 'deletedAt'> | null => {
    if (!entity) return null;
    const { deletedAt: _deletedAt, ...rest } = entity;
    return rest;
};

export const omitDeletedAtAll = <T extends SoftDeletable>(
    entities: T[]
): Omit<T, 'deletedAt'>[] => {
    return entities.map((entity) => omitDeletedAt(entity)!);
};