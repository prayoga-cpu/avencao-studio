/** Erreurs métier traduites en messages clairs par le wrapper d'actions. */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "Accès refusé : vos droits ne permettent pas cette action.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class UnauthenticatedError extends Error {
  constructor(message = "Session expirée : reconnectez-vous.") {
    super(message);
    this.name = "UnauthenticatedError";
  }
}

export class NotFoundError extends Error {
  constructor(message = "Élément introuvable ou inaccessible.") {
    super(message);
    this.name = "NotFoundError";
  }
}

/** Modification concurrente détectée (verrou optimiste sur `version`). */
export class ConflictError extends Error {
  constructor(message = "Cet élément a été modifié entre-temps. Rechargez la page puis recommencez.") {
    super(message);
    this.name = "ConflictError";
  }
}
